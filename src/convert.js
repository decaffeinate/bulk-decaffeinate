import { exec } from 'mz/child_process';
import { copy, move, readFile, unlink, writeFile } from 'fs-promise';
import { basename, join, relative, resolve } from 'path';
import git from 'simple-git/promise';
import zlib from 'zlib';

import getFilesToProcess from './config/getFilesToProcess';
import makeCLIFn from './runner/makeCLIFn';
import makeDecaffeinateVerifyFn from './runner/makeDecaffeinateVerifyFn';
import runWithProgressBar from './runner/runWithProgressBar';
import CLIError from './util/CLIError';
import execLive from './util/execLive';
import { backupPathFor, decaffeinateOutPathFor, isExtensionless, jsPathFor } from './util/FilePaths';
import getFilesUnderPath from './util/getFilesUnderPath';
import isWorktreeEmpty from './util/isWorktreeEmpty';
import makeCommit from './util/makeCommit';
import pluralize from './util/pluralize';

export default async function convert(config) {
  await assertGitWorktreeClean();

  let coffeeFiles = await getFilesToProcess(config);
  let coffeeFilesWithExtension = coffeeFiles.filter(p => !isExtensionless(p));
  // Extensionless files are special because they don't change their name, so
  // handle them separately in some cases.
  let coffeeFilesWithoutExtension = coffeeFiles.filter(p => isExtensionless(p));
  let {decaffeinateArgs = [], decaffeinatePath} = config;

  if (!config.skipVerify) {
    try {
      await runWithProgressBar(
        'Verifying that decaffeinate can successfully convert these files...',
        coffeeFiles, makeDecaffeinateVerifyFn(config));
    } catch (e) {
      throw new CLIError(`\
Some files could not be converted with decaffeinate.
Re-run with the "check" command for more details.`);
    }
  }

  await runWithProgressBar(
    'Backing up files to .original.coffee...',
    coffeeFiles,
    async function(coffeePath) {
      await copy(`${coffeePath}`, `${backupPathFor(coffeePath)}`);
    });

  await runWithProgressBar(
    'Renaming files from .coffee to .js...',
    coffeeFilesWithExtension,
    async function(coffeePath) {
      await move(coffeePath, jsPathFor(coffeePath));
    });

  let shortDescription = getShortDescription(coffeeFiles);
  let renameCommitMsg =
    `decaffeinate: Rename ${shortDescription} from .coffee to .js`;

  if (coffeeFilesWithExtension.length > 0) {
    console.log(`Generating the first commit: "${renameCommitMsg}"...`);
    await git().rm(coffeeFilesWithExtension);
    await git().raw(['add', '-f', ...coffeeFilesWithExtension.map(p => jsPathFor(p))]);
    await makeCommit(renameCommitMsg);
  }

  await runWithProgressBar(
    'Moving files back...',
    coffeeFilesWithExtension,
    async function(coffeePath) {
      await move(jsPathFor(coffeePath), coffeePath);
    });

  await runWithProgressBar(
    'Running decaffeinate on all files...',
    coffeeFiles,
    makeCLIFn(path => `${decaffeinatePath} ${decaffeinateArgs.join(' ')} ${path}`)
  );

  await runWithProgressBar(
    'Deleting old files...',
    coffeeFiles,
    async function(coffeePath) {
      await unlink(coffeePath);
    });

  await runWithProgressBar(
    'Setting proper extension for all files...',
    coffeeFilesWithoutExtension,
    async function(coffeePath) {
      await move(decaffeinateOutPathFor(coffeePath), jsPathFor(coffeePath));
    });

  let decaffeinateCommitMsg =
    `decaffeinate: Convert ${shortDescription} to JS`;
  console.log(`Generating the second commit: ${decaffeinateCommitMsg}...`);
  let jsFiles = coffeeFiles.map(f => jsPathFor(f));
  await git().raw(['add', '-f', ...jsFiles]);
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
    let scriptPath = join(__dirname, '../jscodeshift-scripts-dist/fix-imports.js');

    let options = {
      convertedFiles: jsFiles.map(p => resolve(p)),
      absoluteImportPaths: absoluteImportPaths.map(p => resolve(p)),
    };
    let eligibleFixImportsFiles = await getEligibleFixImportsFiles(searchPath, jsFiles);
    console.log('Fixing any imports across the whole codebase...');
    if (eligibleFixImportsFiles.length > 0) {
      // Note that the args can get really long, so we take reasonable steps to
      // reduce the chance of hitting the system limit on arg length
      // (256K by default on Mac).
      let eligibleRelativePaths = eligibleFixImportsFiles.map(p => relative('', p));
      thirdCommitModifiedFiles = eligibleFixImportsFiles;
      let encodedOptions = zlib.deflateSync(JSON.stringify(options)).toString('base64');
      await execLive(`\
      ${config.jscodeshiftPath} --parser flow -t ${scriptPath} \
        ${eligibleRelativePaths.join(' ')} --encoded-options=${encodedOptions}`);
    }
  }

  let eslintResults = await runWithProgressBar(
    'Running eslint --fix on all files...', jsFiles, makeEslintFixFn(config));
  for (let result of eslintResults) {
    for (let message of result.messages) {
      console.log(message);
    }
  }

  if (config.codePrefix) {
    await runWithProgressBar(
      'Adding code prefix to converted files...', jsFiles, async function(path) {
        await prependToFile(path, config.codePrefix);
        return {error: null};
      });
  }

  let postProcessCommitMsg =
    `decaffeinate: Run post-processing cleanups on ${shortDescription}`;
  console.log(`Generating the third commit: ${postProcessCommitMsg}...`);
  await git().raw(['add', '-f', ...thirdCommitModifiedFiles]);
  await makeCommit(postProcessCommitMsg);

  console.log(`Successfully ran decaffeinate on ${pluralize(coffeeFiles.length, 'file')}.`);
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

function getShortDescription(coffeeFiles) {
  let firstFile = basename(coffeeFiles[0]);
  if (coffeeFiles.length === 1) {
    return firstFile;
  } else {
    return `${firstFile} and ${pluralize(coffeeFiles.length - 1, 'other file')}`;
  }
}

function resolveJscodeshiftScriptPath(scriptPath) {
  if ([
      'prefer-function-declarations.js',
      'remove-coffee-from-imports.js',
      'top-level-this-to-exports.js',
    ].includes(scriptPath)) {
    return join(__dirname, `../jscodeshift-scripts-dist/${scriptPath}`);
  }
  return scriptPath;
}

async function getEligibleFixImportsFiles(searchPath, jsFiles) {
  let jsBasenames = jsFiles.map(p => basename(p, '.js'));
  let resolvedPaths = jsFiles.map(p => resolve(p));
  let allJsFiles = await getFilesUnderPath(searchPath, p => p.endsWith('.js'));
  await runWithProgressBar(
    'Searching for files that may need to have updated imports...',
    allJsFiles,
    async function(p) {
      let resolvedPath = resolve(p);
      if (resolvedPaths.includes(resolvedPath)) {
        return {error: null};
      }
      let contents = (await readFile(resolvedPath)).toString();
      for (let jsBasename of jsBasenames) {
        if (contents.includes(jsBasename)) {
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
      `${config.eslintPath} --fix --format json ${path}; :`,
      {maxBuffer: 10000*1024}))[0];

    let ruleIds;
    if (eslintOutputStr.includes("ESLint couldn't find a configuration file")) {
      messages.push(`Skipping "eslint --fix" on ${path} because there was no eslint config file.`);
      ruleIds = [];
    } else {
      let eslintOutput;
      try {
        eslintOutput = JSON.parse(eslintOutputStr);
      } catch (e) {
        throw new CLIError(`Error while running eslint:\n${eslintOutputStr}`);
      }
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

    await prependToFile(`${path}`, `\
// TODO: This file was created by bulk-decaffeinate.
// ${suggestionLine}
`);
    if (ruleIds.length > 0) {
      await prependToFile(`${path}`, `\
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
  let lines = contents.toString().split('\n');
  if (lines[0] && lines[0].startsWith('#!')) {
    contents = lines[0] + '\n' + prependText + lines.slice(1).join('\n');
  } else {
    contents = prependText + contents;
  }
  await writeFile(path, contents);
}
