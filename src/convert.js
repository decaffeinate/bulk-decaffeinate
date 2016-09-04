import { exec } from 'mz/child_process';
import { readFile, writeFile } from 'mz/fs';

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
  let renameCommitMsg =
    `decaffeinate: Rename ${pluralize(baseFiles.length, 'file')} from .coffee to .js`;
  console.log(`Generating the first commit: "${renameCommitMsg}"...`);
  await exec(`git commit -m "${renameCommitMsg}" --author "${gitAuthor}"`);

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
    `decaffeinate: Convert ${pluralize(baseFiles.length, 'file')} to JS`;
  console.log(`Generating the second commit: ${decaffeinateCommitMsg}...`);
  await exec(`git commit -m "${decaffeinateCommitMsg}" --author "${gitAuthor}"`);

  let jsFiles = baseFiles.map(f => `${f}.js`);

  if (config.jscodeshiftScripts) {
    for (let scriptPath of config.jscodeshiftScripts) {
      console.log(`Running jscodeshift script ${scriptPath}...`);
      await execLive(`${config.jscodeshiftPath} -t ${scriptPath} ${jsFiles.join(' ')}`);
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

  await runWithProgressBar(
    'Running eslint --fix on all files...', baseFiles, makeEslintFixFn(config));

  await runCommand(
    'Running git add on all files again...',
    p => `git add ${p}.js`,
    {runInSeries: true});

  let postProcessCommitMsg =
    `decaffeinate: Run post-processing cleanups on ${pluralize(baseFiles.length, 'file')}`;
  console.log(`Generating the third commit: ${postProcessCommitMsg}...`);
  await exec(`git commit -m "${postProcessCommitMsg}" --author "${gitAuthor}"`);

  console.log(`Successfully ran decaffeinate on ${pluralize(baseFiles.length, 'file')}.`);
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

function makeEslintFixFn(config) {
  return async function runEslint(path) {
    // Ignore the eslint exit code; it gives useful stdout in the same format
    // regardless of the exit code.
    let eslintOutputStr = (await exec(
      `${config.eslintPath} --fix --format json ${path}.js; :`))[0];
    let eslintOutput = JSON.parse(eslintOutputStr);
    let ruleIds = eslintOutput[0].messages.map(message => message.ruleId);
    ruleIds = Array.from(new Set(ruleIds)).sort();
    await prependToFile(`${path}.js`, `\
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
`);
    if (ruleIds.length > 0) {
      await prependToFile(`${path}.js`, `\
/* eslint-disable
${ruleIds.map(ruleId => `    ${ruleId},`).join('\n')}
*/
`);
    }
    return {error: null};
  };
}

async function prependToFile(path, prependText) {
  let contents = await readFile(path);
  contents = prependText + contents;
  await writeFile(path, contents);
}
