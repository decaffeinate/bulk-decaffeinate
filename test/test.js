/* eslint-env mocha */
import 'babel-polyfill';

import assert from 'assert';
import { exec } from 'mz/child_process';

async function runCli(args) {
  return (await exec(`bin/bulk-decaffeinate ${args}`)).toString();
}

function assertIncludes(stdout, substr) {
  assert(
    stdout.includes(substr),
    `Expected stdout to include "${substr}".\n\nFull stdout:\n${stdout}`
  );
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
    assertIncludes(stdout, 'Trying decaffeinate on 2 files');
    assertIncludes(stdout, 'All checks succeeded');
  });
});

describe('simple-error', () => {
  it('discovers two files and fails on one', async function() {
    let stdout = await runCli('check -d test/examples/simple-error');
    assertIncludes(stdout, 'Trying decaffeinate on 2 files');
    assertIncludes(stdout, '1 files failed to convert');
  });
});

describe('file-list', () => {
  it('reads a path file containing two lines, and ignores the other file', async function() {
    let stdout = await runCli('check --path-file test/examples/file-list/files-to-decaffeinate.txt');
    assertIncludes(stdout, 'Trying decaffeinate on 3 files');
    assertIncludes(stdout, 'All checks succeeded');
  });
});
