/* eslint-env mocha */
import 'babel-polyfill';

import assert from 'assert';
import { exec } from 'mz/child_process';
import { exists, readFile } from 'mz/fs';

import getFilesUnderPath from '../src/util/getFilesUnderPath';

let originalCwd = process.cwd();

async function runCli(args) {
  let [stdout, stderr] = (await exec(`"${originalCwd}/bin/bulk-decaffeinate" \
    --decaffeinate-path "${originalCwd}/node_modules/.bin/decaffeinate" \
    --jscodeshift-path "${originalCwd}/node_modules/.bin/jscodeshift" \
    --eslint-path "${originalCwd}/node_modules/.bin/eslint" \
    ${args}`));
  return {stdout, stderr};
}

function assertIncludes(output, substr) {
  assert(
    output.includes(substr),
    `Expected the output to include "${substr}".\n\nFull output:\n${output}`
  );
}

async function assertFileContents(path, expectedContents) {
  let contents = (await readFile(path)).toString();
  assert.equal(contents, expectedContents);
}

async function assertFilesEqual(actualFile, expectedFile) {
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
async function runWithTemplateDir(exampleName, fn) {
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

async function initGitRepo() {
  await exec('git init');
  await exec('git config user.name "Sample User"');
  await exec('git config user.email "sample@example.com"');
  await exec('git add -A');
  await exec('git commit -m "Initial commit"');
}

describe('basic CLI', () => {
  it('shows a help message when invoked with no arguments', async function() {
    let {stdout} = await runCli('');
    assertIncludes(stdout, 'Usage:');
    assertIncludes(stdout, 'Commands:');
    assertIncludes(stdout, 'Options:');
  });
});

describe('simple-success', () => {
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
});

describe('simple-error', () => {
  it('discovers two files and fails on one', async function() {
    let {stdout} = await runCli('check -d test/examples/simple-error');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 2 files...');
    assertIncludes(stdout, '1 file failed to convert');
  });
});

describe('file-list', () => {
  it('reads a path file containing two lines, and ignores the other file', async function() {
    let {stdout} = await runCli('check --path-file test/examples/file-list/files-to-decaffeinate.txt');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 3 files...');
    assertIncludes(stdout, 'All checks succeeded');
  });
});

describe('config files', () => {
  it('reads the list of files from a config file', async function() {
    await runWithTemplateDir('simple-config-file', async function() {
      let {stdout} = await runCli('check');
      assertIncludes(stdout, 'Doing a dry run of decaffeinate on 1 file...');
      assertIncludes(stdout, 'All checks succeeded');
    });
  });
});

describe('convert', () => {
  it('generates git commits converting the files', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await initGitRepo();
      let {stdout} = await runCli('convert');
      assertIncludes(stdout, 'Successfully ran decaffeinate');

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

  it('runs jscodeshift', async function() {
    await runWithTemplateDir('jscodeshift-test', async function() {
      await initGitRepo();
      let {stdout} = await runCli('convert');
      assertIncludes(stdout, 'Successfully ran decaffeinate');

      await assertFileContents('./A.js', `\
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
let nameAfter = 3;
let notChanged = 4;
`);
    });
  });

  it('prepends "eslint-env mocha" when specified', async function() {
    await runWithTemplateDir('mocha-env-test', async function () {
      await initGitRepo();
      let {stdout} = await runCli('convert');
      assertIncludes(stdout, 'Successfully ran decaffeinate');

      await assertFileContents('./A.js', `\
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
console.log('This is production code');
`);

      await assertFileContents('./A-test.js', `\
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/* eslint-env mocha */
console.log('This is test code');
`);
    });
  });

  it('runs eslint, applying fixes and disabling existing issues', async function() {
    await runWithTemplateDir('eslint-fix-test', async function() {
      await initGitRepo();
      let {stdout} = await runCli('convert');
      assertIncludes(stdout, 'Successfully ran decaffeinate');

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

  it('fails when .coffee and .js files both exist', async function() {
    await runWithTemplateDir('existing-js-file', async function() {
      await initGitRepo();
      let {stderr} = await runCli('convert');
      assertIncludes(stderr, 'The file A.js already exists.');
    });
  });

  it('fails when the git worktree has changes', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await initGitRepo();
      await exec('echo "x = 2" >> A.coffee');
      let {stderr} = await runCli('convert');
      assertIncludes(stderr, 'You have modifications to your git worktree.');
      await exec('git add A.coffee');
      ({stderr} = await runCli('convert'));
      assertIncludes(stderr, 'You have modifications to your git worktree.');
    });
  });

  it('generates backup files that are removed by clean', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await initGitRepo();
      await runCli('convert');
      assert(
        await exists('./A.original.coffee'),
        'Expected a backup file to be created.'
      );
      await runCli('clean');
      assert(
        !await exists('./A.original.coffee'),
        'Expected the "clean" command to get rid of the backup file.'
      );
    });
  });
});

describe('fix-imports', () => {
  async function runFixImportsTest(dirName) {
    await runWithTemplateDir(dirName, async function () {
      // We intentionally call the files ".js.expected" so that jscodeshift
      // doesn't discover and try to convert them.
      await initGitRepo();
      let {stdout, stderr} = await runCli('convert');
      assertIncludes(stdout, 'Fixing any imports across the whole codebase');
      assert.equal(stderr, '');

      let expectedFiles = await getFilesUnderPath('.', path => path.endsWith('.expected'));
      assert(expectedFiles.length > 0);
      for (let expectedFile of expectedFiles) {
        let actualFile = expectedFile.substr(0, expectedFile.length - '.expected'.length);
        await assertFilesEqual(actualFile, expectedFile);
      }
    });
  }

  it('handles absolute imports', async function() {
    await runFixImportsTest('fix-imports-absolute-imports');
  });

  it('converts a default import to import * when necessary', async function() {
    await runFixImportsTest('fix-imports-default-import-to-import-star');
  });

  it('properly fixes import statements in pre-existing JS files', async function() {
    await runFixImportsTest('fix-imports-import-from-existing-js');
  });

  it('converts named imports to destructure statements when necessary', async function() {
    await runFixImportsTest('fix-imports-named-import-to-destructure');
  });

  it('properly handles existing JS code using import *', async function() {
    await runFixImportsTest('fix-imports-star-import-from-existing-js');
  });

  it('properly destructures from import * if necessary', async function() {
    await runFixImportsTest('fix-imports-destructure-from-import-star');
  });

  it('properly reads exports when "export function" is used', async function() {
    await runFixImportsTest('fix-imports-export-function');
  });

  it('uses an import * import when necessary even when there are no name usages', async function() {
    await runFixImportsTest('fix-imports-no-name-usages');
  });
});
