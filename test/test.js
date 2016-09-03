/* eslint-env mocha */
import 'babel-polyfill';

import assert from 'assert';
import { exec } from 'mz/child_process';
import { readFile } from 'mz/fs';

let originalCwd = process.cwd();

async function runCli(args) {
  return (await exec(`"${originalCwd}/bin/bulk-decaffeinate" \
    --decaffeinate-path "${originalCwd}/node_modules/.bin/decaffeinate" \
    --eslint-path "${originalCwd}/node_modules/.bin/eslint" \
    ${args}`))[0];
}

function assertIncludes(stdout, substr) {
  assert(
    stdout.includes(substr),
    `Expected stdout to include "${substr}".\n\nFull stdout:\n${stdout}`
  );
}

async function assertFileContents(path, expectedContents) {
  let contents = (await readFile(path)).toString();
  assert.equal(contents, expectedContents);
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
    assertIncludes(stdout, '1 file failed to convert');
  });
});

describe('file-list', () => {
  it('reads a path file containing two lines, and ignores the other file', async function() {
    let stdout = await runCli('check --path-file test/examples/file-list/files-to-decaffeinate.txt');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 3 files...');
    assertIncludes(stdout, 'All checks succeeded');
  });
});

describe('config files', () => {
  it('reads the list of files from a config file', async function() {
    await runWithTemplateDir('simple-config-file', async function() {
      let stdout = await runCli('check');
      assertIncludes(stdout, 'Doing a dry run of decaffeinate on 1 file...');
      assertIncludes(stdout, 'All checks succeeded');
    });
  });
});

describe('convert', () => {
  async function initGitRepo() {
    await exec('git init');
    await exec('git config user.name "Sample User"');
    await exec('git config user.email "sample@example.com"');
    await exec('git add -A');
    await exec('git commit -m "Initial commit"');
  }

  it('generates git commits converting the files', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await initGitRepo();
      let decaffeinateStdout = await runCli('convert');
      assertIncludes(decaffeinateStdout, 'Successfully ran decaffeinate');

      let logStdout = (await exec('git log --pretty="%an <%ae> %s"'))[0];
      assert.equal(logStdout, `\
decaffeinate <sample@example.com> decaffeinate: Run post-processing cleanups on 2 files
decaffeinate <sample@example.com> decaffeinate: Convert 2 files to JS
decaffeinate <sample@example.com> decaffeinate: Rename 2 files from .coffee to .js
Sample User <sample@example.com> Initial commit
`
      );
    });
  });

  it('runs eslint, applying fixes and disabling existing issues', async function() {
    await runWithTemplateDir('eslint-fix-test', async function() {
      await initGitRepo();
      let decaffeinateStdout = await runCli('convert');
      assertIncludes(decaffeinateStdout, 'Successfully ran decaffeinate');

      await assertFileContents('./A.js', `\
/* eslint-disable
    no-console,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
const x = 2;
const y = 3;
console.log(x);
`);
    });
  });
});
