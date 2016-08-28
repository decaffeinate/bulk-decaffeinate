import { exec } from 'mz/child_process';

import CLIError from './CLIError';
import getDecaffeinateCommand from './getDecaffeinateCommand';
import resolveFileQuery from './resolveFileQuery';
import runWithProgressBar from './runWithProgressBar';

export default async function convert(fileQuery, decaffeinatePath) {
  let {decaffeinateCheckFn, decaffeinateFn} =
    await getDecaffeinateCommand(decaffeinatePath);
  let coffeeFiles = await resolveFileQuery(fileQuery);
  let baseFiles = getBaseFiles(coffeeFiles);

  let decaffeinateResults = await runWithProgressBar(
    'Verifying that decaffeinate can successfully convert these files...',
    coffeeFiles, decaffeinateCheckFn);
  if (decaffeinateResults.filter(r => r.error !== null).length > 0) {
    throw new CLIError(`\
Some files could not be convered with decaffeinate.
Re-run with the "check" command for more details.`);
  }

  async function runCommand(description, commandByPath, {runInSeries}={}) {
    await runWithProgressBar(description, baseFiles, async function(path) {
      await exec(commandByPath(path));
      return {error: null};
    }, {runInSeries});
  }

  await runCommand(
    'Backing up files to .original.coffee...',
    p => `cp ${p}.coffee ${p}.original.coffee`);

  await runCommand(
    'Renaming files from .coffee to .js in git...',
    p => `git mv ${p}.coffee ${p}.js`,
    {runInSeries: true});

  let renameCommitMsg =
    `Decaffeinate: Rename ${baseFiles.length} files from .coffee to .js`;
  console.log(`Generating the first commit: "${renameCommitMsg}"...`);
  await exec(`git commit -m "${renameCommitMsg}"`);

  await runCommand(
    'Moving files back...',
    p => `mv ${p}.js ${p}.coffee`);

  await runWithProgressBar(
    'Running decaffeinate on all files...',
    coffeeFiles,
    decaffeinateFn
  );

  await runCommand(
    'Running rm on old files...',
    p => `rm ${p}.coffee`);

  await runCommand(
    'Running git add on new files...',
    p => `git add ${p}.js`,
    {runInSeries: true});

  let decaffeinateCommitMsg =
    `Decaffeinate: Convert ${baseFiles.length} files to JS`;
  console.log(`Generating the second commit: ${decaffeinateCommitMsg}...`);
  await exec(`git commit -m "${decaffeinateCommitMsg}"`);
  
  console.log(`Successfully ran decaffeinate on ${baseFiles.length} files.`);
}

function getBaseFiles(coffeeFiles) {
  return coffeeFiles.map(coffeeFile => {
    if (!coffeeFile.endsWith('.coffee')) {
      throw new CLIError(`The non-CoffeeScript file ${coffeeFile} was specified.`);
    }
    return coffeeFile.substring(0, coffeeFile.length - '.coffee'.length);
  });
}
