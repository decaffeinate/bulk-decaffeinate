import { exec } from 'mz/child_process';
import { copy, move, readFile, unlink, writeFile } from 'fs-promise';
import path from 'path';
import git from 'simple-git/promise';
import zlib from 'zlib';

import makeCLIFn from './runner/makeCLIFn';
import runWithProgressBar from './runner/runWithProgressBar';
import CLIError from './util/CLIError';
import execLive from './util/execLive';
import getFilesUnderPath from './util/getFilesUnderPath';
import isWorktreeEmpty from './util/isWorktreeEmpty';
import makeCommit from './util/makeCommit';
import pluralize from './util/pluralize';

export default async function convert(config) {
  await assertGitWorktreeClean();

  let coffeeFiles = config.filesToProcess;
  let baseFiles = getBaseFiles(coffeeFiles);
  let {decaffeinateArgs = [], decaffeinatePath} = config;

  if (!config.skipVerify) {
    try {
      await runWithProgressBar(
        'Verifying that decaffeinate can successfully convert these files...',
        coffeeFiles, makeCLIFn(path =>
          `${decaffeinatePath} ${decaffeinateArgs.join(' ')} < ${path}`));
    } catch (e) {
      throw new CLIError(`\
Some files could not be convered with decaffeinate.
Re-run with the "check" command for more details.`);
    }
  }

  async function runAsync(description, asyncFn) {
    await runWithProgressBar(
      description, baseFiles, async function(path) {
        await asyncFn(path);
        return {path};
      });
  }

  await runAsync(
    'Backing up files to .original.coffee...',
    async function(basePath) {
      await copy(`${basePath}.coffee`, `${basePath}.original.coffee`);
    });

  await runAsync(
    'Renaming files from .coffee to .js...',
    async function(basePath) {
      await move(`${basePath}.coffee`, `${basePath}.js`);
    });

  let shortDescription = getShortDescription(baseFiles);
  let renameCommitMsg =
    `decaffeinate: Rename ${shortDescription} from .coffee to .js`;
  console.log(`Generating the first commit: "${renameCommitMsg}"...`);
  await git().rm(baseFiles.map(p => `${p}.coffee`));
  await git().add(baseFiles.map(p => `${p}.js`));
  await makeCommit(renameCommitMsg);

  await runAsync(
    'Moving files back...',
    async function(basePath) {
      await move(`${basePath}.js`, `${basePath}.coffee`);
    });

  await runWithProgressBar(
    'Running decaffeinate on all files...',
    coffeeFiles,
    makeCLIFn(path => `${decaffeinatePath} ${decaffeinateArgs.join(' ')} ${path}`)
  );

  await runAsync(
    'Deleting old files...',
    async function(basePath) {
      await unlink(`${basePath}.coffee`);
    });

  let decaffeinateCommitMsg =
    `decaffeinate: Convert ${shortDescription} to JS`;
  console.log(`Generating the second commit: ${decaffeinateCommitMsg}...`);
  let jsFiles = baseFiles.map(f => `${f}.js`);
  await git().add(jsFiles);
  await makeCommit(decaffeinateCommitMsg);

  if (config.jscodeshiftScripts) {
    for (let scriptPath of config.jscodeshiftScripts) {
      let resolvedPath = resolveJscodeshiftScriptPath(scriptPath);
      console.log(`Running jscodeshift script ${resolvedPath}...`);
      await execLive(`${config.jscodeshiftPath} --parser flow \
        -t ${resolvedPath} ${jsFiles.join(' ')}`);
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

  let thirdCommitModifiedFiles = jsFiles.slice();
  if (config.fixImportsConfig) {
    let {searchPath, absoluteImportPaths} = config.fixImportsConfig;
    if (!absoluteImportPaths) {
      absoluteImportPaths = [];
    }
    let scriptPath = path.join(__dirname, '../jscodeshift-scripts-dist/fix-imports.js');

    let options = {
      convertedFiles: jsFiles.map(p => path.resolve(p)),
      absoluteImportPaths: absoluteImportPaths.map(p => path.resolve(p)),
    };
    let eligibleFixImportsFiles = await getEligibleFixImportsFiles(searchPath, jsFiles);
    console.log('Fixing any imports across the whole codebase...');
    if (eligibleFixImportsFiles.length > 0) {
      // Note that the args can get really long, so we take reasonable steps to
      // reduce the chance of hitting the system limit on arg length
      // (256K by default on Mac).
      let eligibleRelativePaths = eligibleFixImportsFiles.map(p => path.relative('', p));
      thirdCommitModifiedFiles = eligibleFixImportsFiles;
      let encodedOptions = zlib.deflateSync(JSON.stringify(options)).toString('base64');
      await execLive(`\
      ${config.jscodeshiftPath} --parser flow -t ${scriptPath} \
        ${eligibleRelativePaths.join(' ')} --encoded-options=${encodedOptions}`);
    }
  }

  let eslintResults = await runWithProgressBar(
    'Running eslint --fix on all files...', baseFiles, makeEslintFixFn(config));
  for (let result of eslintResults) {
    for (let message of result.messages) {
      console.log(message);
    }
  }

  if (config.codePrefix) {
    await runWithProgressBar(
      'Adding code prefix to converted files...', baseFiles, async function(path) {
        await prependToFile(path + '.js', config.codePrefix);
        return {error: null};
      });
  }

  let postProcessCommitMsg =
    `decaffeinate: Run post-processing cleanups on ${shortDescription}`;
  console.log(`Generating the third commit: ${postProcessCommitMsg}...`);
  await git().add(thirdCommitModifiedFiles);
  await makeCommit(postProcessCommitMsg);

  console.log(`Successfully ran decaffeinate on ${pluralize(baseFiles.length, 'file')}.`);
  console.log('You should now fix lint issues in any affected files.');
  console.log('All CoffeeScript files were backed up as .original.coffee files that you can use for comparison.');
  console.log('You can run "bulk-decaffeinate clean" to remove those files.');
  console.log('To allow git to properly track file history, you should NOT squash the generated commits together.');
}

async function assertGitWorktreeClean() {
  if (!await isWorktreeEmpty()) {
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

function getShortDescription(baseFiles) {
  let firstFile = `${path.basename(baseFiles[0])}.coffee`;
  if (baseFiles.length === 1) {
    return firstFile;
  } else {
    return `${firstFile} and ${pluralize(baseFiles.length - 1, 'other file')}`;
  }
}

function resolveJscodeshiftScriptPath(scriptPath) {
  if ([
      'prefer-function-declarations.js',
      'remove-coffee-from-imports.js',
      'top-level-this-to-exports.js',
    ].includes(scriptPath)) {
    return path.join(__dirname, `../jscodeshift-scripts-dist/${scriptPath}`);
  }
  return scriptPath;
}

async function getEligibleFixImportsFiles(searchPath, jsFiles) {
  let jsBasenames = jsFiles.map(p => path.basename(p, '.js'));
  let resolvedPaths = jsFiles.map(p => path.resolve(p));
  let allJsFiles = await getFilesUnderPath(searchPath, p => p.endsWith('.js'));
  await runWithProgressBar(
    'Searching for files that may need to have updated imports...',
    allJsFiles,
    async function(p) {
      let resolvedPath = path.resolve(p);
      if (resolvedPaths.includes(resolvedPath)) {
        return {error: null};
      }
      let contents = (await readFile(resolvedPath)).toString();
      for (let basename of jsBasenames) {
        if (contents.includes(basename)) {
          resolvedPaths.push(resolvedPath);
          return {error: null};
        }
      }
      return {error: null};
    });
  return resolvedPaths;
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
