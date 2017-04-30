/* eslint-env mocha */
import 'babel-polyfill';

import assert from 'assert';
import { exec } from 'mz/child_process';
import { readFile } from 'mz/fs';

let originalCwd = process.cwd();

export async function runCli(args) {
  let [stdout, stderr] = (await exec(`"${originalCwd}/bin/bulk-decaffeinate" \
    --decaffeinate-path "${originalCwd}/node_modules/.bin/decaffeinate" \
    --jscodeshift-path "${originalCwd}/node_modules/.bin/jscodeshift" \
    --eslint-path "${originalCwd}/node_modules/.bin/eslint" \
    ${args}`));
  return {stdout, stderr};
}

export async function runCliExpectError(args) {
  try {
    await runCli(args);
    throw new Error('Expected the CLI to fail.');
  } catch (e) {
    return e.message;
  }
}

export function assertIncludes(output, substr) {
  assert(
    output.includes(substr),
    `Expected the output to include "${substr}".\n\nFull output:\n${output}`
  );
}

export async function assertFileContents(path, expectedContents) {
  let contents = (await readFile(path)).toString();
  assert.equal(contents, expectedContents);
}

export async function assertFileIncludes(path, expectedSubstr) {
  let contents = (await readFile(path)).toString();
  assert(
    contents.includes(expectedSubstr),
    `Expected file to include "${expectedSubstr}".\n\nFull file contents:\n${contents}`
  );
}

export async function assertFilesEqual(actualFile, expectedFile) {
  let actualContents = (await readFile(actualFile)).toString();
  let expectedContents = (await readFile(expectedFile)).toString();
  assert.equal(
    actualContents, expectedContents,
    `The file ${actualFile} did not match the expected file.`
  );
}

/**
 * Run the given async function inside a temporary directory starting from the
 * given example.
 */
export async function runWithTemplateDir(exampleName, fn) {
  let suffix = Math.floor(Math.random() * 1000000000000);
  let newDir = `./test/tmp-projects/${exampleName}-${suffix}`;
  try {
    await exec(`mkdir -p "${newDir}"`);
    await exec(`cp -r "./test/examples/${exampleName}/." "${newDir}"`);
    process.chdir(newDir);
    await fn();
  } catch (e) {
    console.log('Assertion failure. Test data saved here:');
    console.log(`${originalCwd}${newDir.substr(1)}`);
    throw e;
  } finally {
    process.chdir(originalCwd);
  }
}

export async function initGitRepo() {
  await exec('git init');
  await exec('git config user.name "Sample User"');
  await exec('git config user.email "sample@example.com"');
  await exec('git add -A');
  await exec('git commit -m "Initial commit"');
}
