/* eslint-env mocha */
import assert from 'assert';
import { readFile } from 'mz/fs';

import {
  assertFileIncludes,
  assertIncludes,
  runCli,
  runWithTemplateDir,
} from './test-util';

describe('basic CLI', () => {
  it('shows a help message when invoked with no arguments', async function() {
    let {stdout} = await runCli('');
    assertIncludes(stdout, 'Usage:');
    assertIncludes(stdout, 'Commands:');
    assertIncludes(stdout, 'Options:');
  });
});

describe('check', () => {
  it('discovers and runs files', async function() {
    let {stdout} = await runCli('check -d test/examples/simple-success');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 2 files...');
    assertIncludes(stdout, 'All checks succeeded');
  });

  it('runs files from the current directory', async function() {
    await runWithTemplateDir('simple-success', async function() {
      let {stdout} = await runCli('check');
      assertIncludes(stdout, 'Doing a dry run of decaffeinate on 2 files...');
      assertIncludes(stdout, 'All checks succeeded');
    });
  });

  it('checks literate coffeescript files', async function() {
    await runWithTemplateDir('literate-coffeescript', async function() {
      let {stdout} = await runCli('check');
      assertIncludes(stdout, 'Doing a dry run of decaffeinate on 3 files...');
      assertIncludes(stdout, 'All checks succeeded');
    });
  });

  it('discovers two files and fails on one', async function() {
    let {stdout} = await runCli('check -d test/examples/simple-error');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 2 files...');
    assertIncludes(stdout, '1 file failed to convert');

    await assertFileIncludes(
      'decaffeinate-errors.log',
      'test/examples/simple-error/error.coffee'
    );

    let results = JSON.parse((await readFile('decaffeinate-results.json')).toString());
    assert.equal(results.length, 2);
    assert(results[0].path.endsWith('test/examples/simple-error/error.coffee'));
    assert.notEqual(results[0].error, null);
    assert(results[1].path.endsWith('test/examples/simple-error/success.coffee'));
    assert.equal(results[1].error, null);

    await assertFileIncludes(
      'decaffeinate-successful-files.txt',
      'test/examples/simple-error/success.coffee'
    );
  });

  it('reads a path file containing two lines, and ignores the other file', async function() {
    await runWithTemplateDir('file-list', async function () {
      let {stdout} = await runCli('check --path-file ./files-to-decaffeinate.txt');
      assertIncludes(stdout, 'Doing a dry run of decaffeinate on 3 files...');
      assertIncludes(stdout, 'All checks succeeded');
    });
  });

  it('allows specifying one file', async function() {
    let {stdout} = await runCli('check --file test/examples/simple-success/A.coffee');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 1 file...');
    assertIncludes(stdout, 'All checks succeeded');
  });

  it('allows specifying two files', async function() {
    let {stdout} = await runCli(
      `check --file test/examples/simple-success/A.coffee \
      --file test/examples/simple-success/B.coffee`);
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 2 files...');
    assertIncludes(stdout, 'All checks succeeded');
  });

  it('reads the list of files from a config file', async function() {
    await runWithTemplateDir('simple-config-file', async function() {
      let {stdout, stderr} = await runCli('check');
      assert.equal(stderr, '');
      assertIncludes(stdout, 'Doing a dry run of decaffeinate on 1 file...');
      assertIncludes(stdout, 'All checks succeeded');
    });
  });

  it('excludes a file when instructed', async function() {
    await runWithTemplateDir('file-filter', async function() {
      let {stdout, stderr} = await runCli('check');
      assert.equal(stderr, '');
      assertIncludes(stdout, 'Doing a dry run of decaffeinate on 1 file...');
      assertIncludes(stdout, 'All checks succeeded');
    });
  });

  it('automatically discovers executable scripts', async function() {
    await runWithTemplateDir('executable-extensionless-scripts', async function() {
      let {stdout, stderr} = await runCli('check');
      assert.equal(stderr, '');
      assertIncludes(stdout, 'Doing a dry run of decaffeinate on 1 file...');
      assertIncludes(stdout, 'All checks succeeded');
    });
  });
});
