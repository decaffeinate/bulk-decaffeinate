import { exec } from 'mz/child_process';
import { readFile, writeFile } from 'mz/fs';

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

  let gitAuthor = await getGitAuthor();
  let renameCommitMsg =
    `Decaffeinate: Rename ${pluralize(baseFiles.length, 'file')} from .coffee to .js`;
  console.log(`Generating the first commit: "${renameCommitMsg}"...`);
  await exec(`git commit -m "${renameCommitMsg}" --author "${gitAuthor}"`);

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
  await exec(`git commit -m "${decaffeinateCommitMsg}" --author "${gitAuthor}"`);

  await runWithProgressBar(
    'Running eslint --fix on all files...', baseFiles, makeEslintFixFn(config));

  await runCommand(
    'Running git add on all files again...',
    p => `git add ${p}.js`,
    {runInSeries: true});

  let postProcessCommitMsg =
    `Decaffeinate: Run post-processing cleanups on ${pluralize(baseFiles.length, 'file')}`;
  console.log(`Generating the third commit: ${postProcessCommitMsg}...`);
  await exec(`git commit -m "${postProcessCommitMsg}" --author "${gitAuthor}"`);

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

async function getGitAuthor() {
  let userEmail = (await exec('git config user.email'))[0];
  return `Decaffeinate <${userEmail}>`;
}

function makeEslintFixFn(config) {
  return async function runEslint(path) {
    // Ignore the eslint exit code; it gives useful stdout in the same format
    // regardless of the exit code.
    let eslintOutputStr = (await exec(
      `${config.eslintPath} --fix --format json ${path}.js; :`))[0];
    let eslintOutput = JSON.parse(eslintOutputStr);
    let ruleIds = eslintOutput[0].messages.map(message => message.ruleId);
    ruleIds.sort();
    await prependToFile(`${path}.js`, `\
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
`);
    if (ruleIds.length > 0) {
      await prependToFile(`${path}.js`, `\
/* eslint-disable
${ruleIds.map(ruleId => `    ${ruleId},`)}
*/
`);
    }
    return {path, error: null};
  };
}

async function prependToFile(path, prependText) {
  let contents = await readFile(path);
  contents = prependText + contents;
  await writeFile(path, contents);
}
