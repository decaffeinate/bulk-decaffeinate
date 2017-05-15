import { copy, move, unlink } from 'fs-promise';
import { basename } from 'path';
import git from 'simple-git/promise';

import getFilesToProcess from './config/getFilesToProcess';
import prependCodePrefix from './modernize/prependCodePrefix';
import prependMochaEnv from './modernize/prependMochaEnv';
import runEslintFix from './modernize/runEslintFix';
import runFixImports from './modernize/runFixImports';
import runJscodeshiftScripts from './modernize/runJscodeshiftScripts';
import makeCLIFn from './runner/makeCLIFn';
import makeDecaffeinateVerifyFn from './runner/makeDecaffeinateVerifyFn';
import runWithProgressBar from './runner/runWithProgressBar';
import CLIError from './util/CLIError';
import {
  backupPathFor,
  COFFEE_FILE_RECOGNIZER,
  decaffeinateOutPathFor,
  jsPathFor,
} from './util/FilePaths';
import makeCommit from './util/makeCommit';
import pluralize from './util/pluralize';

export default async function convert(config) {
  await assertGitWorktreeClean();

  let coffeeFiles = await getFilesToProcess(config, COFFEE_FILE_RECOGNIZER);
  if (coffeeFiles.length === 0) {
    console.log('There were no CoffeeScript files to convert.');
    return;
  }

  let movingCoffeeFiles = coffeeFiles.filter(p => jsPathFor(p, config) !== p);
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
    `Renaming files from .coffee to .${config.outputFileExtension}...`,
    movingCoffeeFiles,
    async function(coffeePath) {
      await move(coffeePath, jsPathFor(coffeePath, config));
    });

  let shortDescription = getShortDescription(coffeeFiles);
  let renameCommitMsg =
    `decaffeinate: Rename ${shortDescription} from .coffee to .${config.outputFileExtension}`;

  if (movingCoffeeFiles.length > 0) {
    console.log(`Generating the first commit: "${renameCommitMsg}"...`);
    await git().rm(movingCoffeeFiles);
    await git().raw(['add', '-f', ...movingCoffeeFiles.map(p => jsPathFor(p, config))]);
    await makeCommit(renameCommitMsg);
  }

  await runWithProgressBar(
    'Moving files back...',
    movingCoffeeFiles,
    async function(coffeePath) {
      await move(jsPathFor(coffeePath, config), coffeePath);
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
    coffeeFiles,
    async function(coffeePath) {
      let decaffeinateOutPath = decaffeinateOutPathFor(coffeePath);
      let jsPath = jsPathFor(coffeePath, config);
      if (decaffeinateOutPath !== jsPath) {
        await move(decaffeinateOutPath, jsPath);
      }
    });

  let decaffeinateCommitMsg =
    `decaffeinate: Convert ${shortDescription} to JS`;
  console.log(`Generating the second commit: ${decaffeinateCommitMsg}...`);
  let jsFiles = coffeeFiles.map(f => jsPathFor(f, config));
  await git().raw(['add', '-f', ...jsFiles]);
  await makeCommit(decaffeinateCommitMsg);

  if (config.jscodeshiftScripts) {
    await runJscodeshiftScripts(jsFiles, config);
  }
  if (config.mochaEnvFilePattern) {
    await prependMochaEnv(jsFiles, config.mochaEnvFilePattern);
  }
  let thirdCommitModifiedFiles = jsFiles.slice();
  if (config.fixImportsConfig) {
    thirdCommitModifiedFiles = await runFixImports(jsFiles, config);
  }
  await runEslintFix(jsFiles, config, {isUpdate: false});
  if (config.codePrefix) {
    await prependCodePrefix(jsFiles, config.codePrefix);
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
  let status = await git().status();
  if (status.files.length > status.not_added.length) {
    throw new CLIError(`\
You have modifications to your git worktree.
Please revert or commit them before running convert.`);
  } else if (status.not_added.length > 0) {
    console.log(`\
Warning: the following untracked files are present in your repository:
${status.not_added.join('\n')}
Proceeding anyway.
`);
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
