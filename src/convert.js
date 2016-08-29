import { exec } from 'mz/child_process';

import makeCLIFn from './runner/makeCLIFn';
import runWithProgressBar from './runner/runWithProgressBar';
import CLIError from './util/CLIError';
import pluralize from './util/pluralize';

export default async function convert(config) {
  let {filesToProcess: coffeeFiles, decaffeinatePath} = config;
  let baseFiles = getBaseFiles(coffeeFiles);

  let decaffeinateResults = await runWithProgressBar(
    'Verifying that decaffeinate can successfully convert these files...',
    coffeeFiles, makeCLIFn(path => `${decaffeinatePath} < ${path}`));
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

  let renameCommitMsg =
    `Decaffeinate: Rename ${pluralize(baseFiles.length, 'file')} from .coffee to .js`;
  console.log(`Generating the first commit: "${renameCommitMsg}"...`);
  await exec(`git commit -m "${renameCommitMsg}"`);

  await runCommand(
    'Moving files back...',
    p => `mv ${p}.js ${p}.coffee`);

  await runWithProgressBar(
    'Running decaffeinate on all files...',
    coffeeFiles,
    makeCLIFn(path => `${decaffeinatePath} ${path}`)
  );

  await runCommand(
    'Running rm on old files...',
    p => `rm ${p}.coffee`);

  await runCommand(
    'Running git add on new files...',
    p => `git add ${p}.js`,
    {runInSeries: true});

  let decaffeinateCommitMsg =
    `Decaffeinate: Convert ${pluralize(baseFiles.length, 'file')} to JS`;
  console.log(`Generating the second commit: ${decaffeinateCommitMsg}...`);
  await exec(`git commit -m "${decaffeinateCommitMsg}"`);
  
  console.log(`Successfully ran decaffeinate on ${pluralize(baseFiles.length, 'file')}.`);
}

function getBaseFiles(coffeeFiles) {
  return coffeeFiles.map(coffeeFile => {
    if (!coffeeFile.endsWith('.coffee')) {
      throw new CLIError(`The non-CoffeeScript file ${coffeeFile} was specified.`);
    }
    return coffeeFile.substring(0, coffeeFile.length - '.coffee'.length);
  });
}
