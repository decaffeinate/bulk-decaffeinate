/* eslint-env mocha */
import 'babel-polyfill';

import assert from 'assert';
import { exec } from 'mz/child_process';

let originalCwd = process.cwd();

async function runCli(args) {
  return (await exec(`"${originalCwd}/bin/bulk-decaffeinate" \
    --decaffeinate-path "${originalCwd}/node_modules/.bin/decaffeinate" \
    ${args}`)).toString();
}

function assertIncludes(stdout, substr) {
  assert(
    stdout.includes(substr),
    `Expected stdout to include "${substr}".\n\nFull stdout:\n${stdout}`
  );
}

/**
 * Run the given async function inside a temporary directory starting from the
 * given example.
 */
async function runWithTemplateDir(exampleName, fn) {
  try {
    let suffix = Math.floor(Math.random() * 1000000000000);
    let newDir = `./test/tmp-projects/${exampleName}-${suffix}`;
    await exec(`mkdir -p "${newDir}"`);
    await exec(`cp -r "./test/examples/${exampleName}/." "${newDir}"`);
    process.chdir(newDir);
    await fn();
  } finally {
    process.chdir(originalCwd);
  }
}

describe('basic CLI', () => {
  it('shows a help message when invoked with no arguments', async function() {
    let stdout = await runCli('');
    assertIncludes(stdout, 'Usage:');
    assertIncludes(stdout, 'Commands:');
    assertIncludes(stdout, 'Options:');
  });
});

describe('simple-success', () => {
  it('discovers and runs files', async function() {
    let stdout = await runCli('check -d test/examples/simple-success');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 2 files...');
    assertIncludes(stdout, 'All checks succeeded');
  });

  it('runs files from the current directory', async function() {
    await runWithTemplateDir('simple-success', async function() {
      let stdout = await runCli('check');
      assertIncludes(stdout, 'Doing a dry run of decaffeinate on 2 files...');
      assertIncludes(stdout, 'All checks succeeded');
    });
  });
});

describe('simple-error', () => {
  it('discovers two files and fails on one', async function() {
    let stdout = await runCli('check -d test/examples/simple-error');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 2 files...');
    assertIncludes(stdout, '1 files failed to convert');
  });
});

describe('file-list', () => {
  it('reads a path file containing two lines, and ignores the other file', async function() {
    let stdout = await runCli('check --path-file test/examples/file-list/files-to-decaffeinate.txt');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 3 files...');
    assertIncludes(stdout, 'All checks succeeded');
  });
});

describe('convert', () => {
  it('generates git commits converting the files', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await exec('git init');
      await exec('git config user.name "Sample User"');
      await exec('git config user.email "sample@example.com"');
      await exec('git add -A');
      await exec('git commit -m "Initial commit"');
      let decaffeinateStdout = await runCli('convert');
      assertIncludes(decaffeinateStdout, 'Successfully ran decaffeinate');

      let logStdout = (await exec('git log --pretty=%s')).toString();
      assertIncludes(logStdout, `\
Decaffeinate: Convert 2 files to JS
Decaffeinate: Rename 2 files from .coffee to .js
Initial commit`);
    });
  });
});
