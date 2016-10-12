import { exec } from 'mz/child_process';
import { readFile, writeFile } from 'mz/fs';
import path from 'path';

import makeCLIFn from './runner/makeCLIFn';
import runWithProgressBar from './runner/runWithProgressBar';
import CLIError from './util/CLIError';
import execLive from './util/execLive';
import pluralize from './util/pluralize';

export default async function convert(config) {
  await assertGitWorktreeClean();

  let coffeeFiles = config.filesToProcess;
  let baseFiles = getBaseFiles(coffeeFiles);

  let decaffeinateResults = await runWithProgressBar(
    'Verifying that decaffeinate can successfully convert these files...',
    coffeeFiles, makeCLIFn(path => `${config.decaffeinatePath} < ${path}`));
  if (decaffeinateResults.filter(r => r.error !== null).length > 0) {
    throw new CLIError(`\
Some files could not be convered with decaffeinate.
Re-run with the "check" command for more details.`);
  }

  async function runCommand(description, commandByPath, {runInSeries}={}) {
    await runWithProgressBar(
      description, baseFiles, makeCLIFn(commandByPath), {runInSeries});
  }

  await runCommand(
    'Backing up files to .original.coffee...',
    p => `cp ${p}.coffee ${p}.original.coffee`);

  await runCommand(
    'Renaming files from .coffee to .js in git...',
    p => `git mv ${p}.coffee ${p}.js`,
    {runInSeries: true});

  let gitAuthor = await getGitAuthor();
  let shortDescription = getShortDescription(baseFiles);
  let renameCommitMsg =
    `decaffeinate: Rename ${shortDescription} from .coffee to .js`;
  console.log(`Generating the first commit: "${renameCommitMsg}"...`);
  await commit(renameCommitMsg, gitAuthor);

  await runCommand(
    'Moving files back...',
    p => `mv ${p}.js ${p}.coffee`);

  await runWithProgressBar(
    'Running decaffeinate on all files...',
    coffeeFiles,
    makeCLIFn(path => `${config.decaffeinatePath} ${path}`)
  );

  await runCommand(
    'Running rm on old files...',
    p => `rm ${p}.coffee`);

  await runCommand(
    'Running git add on new files...',
    p => `git add ${p}.js`,
    {runInSeries: true});

  let decaffeinateCommitMsg =
    `decaffeinate: Convert ${shortDescription} to JS`;
  console.log(`Generating the second commit: ${decaffeinateCommitMsg}...`);
  await commit(decaffeinateCommitMsg, gitAuthor);

  let jsFiles = baseFiles.map(f => `${f}.js`);

  if (config.jscodeshiftScripts) {
    for (let scriptPath of config.jscodeshiftScripts) {
      let resolvedPath = resolveJscodeshiftScriptPath(scriptPath);
      console.log(`Running jscodeshift script ${resolvedPath}...`);
      await execLive(`${config.jscodeshiftPath} -t ${resolvedPath} ${jsFiles.join(' ')}`);
    }
  }

  if (config.mochaEnvFilePattern) {
    let regex = new RegExp(config.mochaEnvFilePattern);
    let testFiles = jsFiles.filter(f => regex.test(f));
    await runWithProgressBar(
      'Adding /* eslint-env mocha */ to test files...', testFiles, async function(path) {
        await prependToFile(path, '/* eslint-env mocha */\n');
        return {error: null};
      });
  }

  if (config.fixImportsConfig) {
    let {searchPath, absoluteImportPaths} = config.fixImportsConfig;
    if (!absoluteImportPaths) {
      absoluteImportPaths = [];
    }
    let scriptPath = path.join(__dirname, '../jscodeshift-scripts-dist/fix-imports.js');
    console.log('Fixing any imports across the whole codebase...');
    let options = {
      convertedFiles: jsFiles.map(p => path.resolve(p)),
      absoluteImportPaths: absoluteImportPaths.map(p => path.resolve(p)),
    };
    let encodedOptions = new Buffer(JSON.stringify(options)).toString('base64');
    await execLive(`\
      ${config.jscodeshiftPath} -t ${scriptPath} ${searchPath}\
        --encoded-options=${encodedOptions}`);
  }

  let eslintResults = await runWithProgressBar(
    'Running eslint --fix on all files...', baseFiles, makeEslintFixFn(config));
  for (let result of eslintResults) {
    for (let message of result.messages) {
      console.log(message);
    }
  }

  console.log(`Running git add for all files with changes...`);
  await exec(`git add -u`);

  let postProcessCommitMsg =
    `decaffeinate: Run post-processing cleanups on ${shortDescription}`;
  console.log(`Generating the third commit: ${postProcessCommitMsg}...`);
  await commit(postProcessCommitMsg, gitAuthor);

  console.log(`Successfully ran decaffeinate on ${pluralize(baseFiles.length, 'file')}.`);
  console.log('You should now fix lint issues in any affected files.');
  console.log('All CoffeeScript files were backed up as .original.coffee files that you can use for comparison.');
  console.log('You can run "bulk-decaffeinate clean" to remove those files.');
  console.log('To allow git to properly track file history, you should NOT squash the generated commits together.');
}

async function assertGitWorktreeClean() {
  let stdout = (await exec('git status --short --untracked-files=no'))[0];
  if (stdout.length) {
    throw new CLIError(`\
You have modifications to your git worktree.
Please revert or commit them before running convert.`);
  }
}

function getBaseFiles(coffeeFiles) {
  return coffeeFiles.map(coffeeFile => {
    if (!coffeeFile.endsWith('.coffee')) {
      throw new CLIError(`The non-CoffeeScript file ${coffeeFile} was specified.`);
    }
    return coffeeFile.substring(0, coffeeFile.length - '.coffee'.length);
  });
}

async function getGitAuthor() {
  let userEmail = (await exec('git config user.email'))[0];
  return `decaffeinate <${userEmail}>`;
}

async function commit(message, author) {
  await exec(`git commit -m "${message}" --author "${author}" --no-verify`);
}

function getShortDescription(baseFiles) {
  let firstFile = `${path.basename(baseFiles[0])}.coffee`;
  if (baseFiles.length === 1) {
    return firstFile;
  } else {
    return `${firstFile} and ${pluralize(baseFiles.length - 1, 'other file')}`;
  }
}

function resolveJscodeshiftScriptPath(scriptPath) {
  if (['prefer-function-declarations.js'].includes(scriptPath)) {
    return path.join(__dirname, `../jscodeshift-scripts-dist/${scriptPath}`);
  }
  return scriptPath;
}

function makeEslintFixFn(config) {
  return async function runEslint(path) {
    let messages = [];

    // Ignore the eslint exit code; it gives useful stdout in the same format
    // regardless of the exit code. Also keep a 10MB buffer since sometimes
    // there can be a LOT of lint failures.
    let eslintOutputStr = (await exec(
      `${config.eslintPath} --fix --format json ${path}.js; :`,
      {maxBuffer: 10000*1024}))[0];

    let ruleIds;
    if (eslintOutputStr.includes("ESLint couldn't find a configuration file")) {
      messages.push(`Skipping "eslint --fix" on ${path}.js because there was no eslint config file.`);
      ruleIds = [];
    } else {
      let eslintOutput = JSON.parse(eslintOutputStr);
      ruleIds = eslintOutput[0].messages
        .map(message => message.ruleId).filter(ruleId => ruleId);
      ruleIds = Array.from(new Set(ruleIds)).sort();
    }

    let suggestionLine;
    if (ruleIds.length > 0) {
      suggestionLine = 'Fix any style issues and re-enable lint.';
    } else {
      suggestionLine = 'Sanity-check the conversion and remove this comment.';
    }

    await prependToFile(`${path}.js`, `\
// TODO: This file was created by bulk-decaffeinate.
// ${suggestionLine}
`);
    if (ruleIds.length > 0) {
      await prependToFile(`${path}.js`, `\
/* eslint-disable
${ruleIds.map(ruleId => `    ${ruleId},`).join('\n')}
*/
`);
    }
    return {error: null, messages};
  };
}

async function prependToFile(path, prependText) {
  let contents = await readFile(path);
  contents = prependText + contents;
  await writeFile(path, contents);
}
