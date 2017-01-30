/* eslint-env mocha */
import assert from 'assert';
import { exec } from 'mz/child_process';
import { exists, readFile, writeFile, mkdtemp, mkdir, rename } from 'mz/fs';
import { join, sep, normalize, resolve } from 'path';

import gitTrackedStatus from '../../src/util/gitTrackedStatus';
import getFilesUnderPath from '../../src/util/getFilesUnderPath';
import cli from '../../src/cli';
const {runCommand, argParse} = cli;

const originalCwd = resolve(join(__dirname, '..', '..'));

Error.stackTraceLimit = 1000;

class MockStream {
  constructor () {
    this.str = '';
  }

  write (str) {
    this.str += str;
  }
}

/**
 * @desc does basically the same as `mkdir -p` but in-proc, and last child is a tmpDir.
 * doesn't throw if parts of the path already exist.
 * @param {string} prefix
 * @returns {Promise.<string>}
 */
async function mkdTempSafe (prefix) {
  let parts = normalize(prefix).split(sep);
  let head = '';
  for (let part of parts) {
    try {
      head = join(head, part);
      await mkdir(head);
    } catch (e) {
      if (e.code === 'EEXIST') continue;
      throw e;
    }
  }
  return await mkdtemp(prefix);
}

async function runCli (args) {
  let argv = ['"fake"', '"gaga"',
    '--decaffeinate-path', `"${join(originalCwd, 'node_modules', '.bin', 'decaffeinate')}"`,
    '--jscodeshift-path', `"${join(originalCwd, 'node_modules', '.bin', 'jscodeshift')}"`,
    '--eslint-path', `"${join(originalCwd, 'node_modules', '.bin', 'eslint')}"`,
    ...args.split(' '),
  ];
  let [command, config] = await argParse(argv);
  global.oldConsole = global.oldConsole || global.console;
  let strm1 = new MockStream();
  let strm2 = new MockStream();
  try {
    Object.defineProperty(global, 'console', {value: new global.oldConsole.Console(strm1, strm2)});
    await runCommand(command, config);
  } finally {
    Object.defineProperty(global, 'console', {value: global.oldConsole});
  }
  let [stdout, stderr] = [strm1.str, strm2.str];
  return {stdout, stderr};
}

function assertIncludes (output, substr) {
  assert(
    output.includes(substr),
    `Expected the output to include '${substr}'.\n\nFull output:\n${output}`
  );
}

async function assertFileContents (path, expectedContents) {
  let contents = (await readFile(path)).toString();
  assert.equal(contents, expectedContents);
}

async function assertFileIncludes (path, expectedSubstr) {
  let contents = (await readFile(path)).toString();
  assert(
    contents.includes(expectedSubstr),
    `Expected file to include '${expectedSubstr}'.\n\nFull file contents:\n${contents}`
  );
}

async function assertFilesEqual (actualFile, expectedFile) {
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
async function runWithTemplateDir (exampleName, fn) {
  let newDirPref = `./test/tmp-projects/${exampleName}/tmp-`;
  let newDir;
  try {
    newDir = await mkdTempSafe(newDirPref);
    await exec(`cp -r './test/examples/${exampleName}/.' '${newDir}'`);
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

async function initGitRepo () {
  await exec('git init');
  await exec('git config user.name "Sample User"');
  await exec('git config user.email "sample@example.com"');
  await exec('git add -A');
  await exec('git commit -m "Initial commit"');
}

describe('basic CLI', () => {
  it('shows a help message when invoked with no arguments', async function () {
    let {stdout} = await runCli('');
    assertIncludes(stdout, 'Usage:');
    assertIncludes(stdout, 'Commands:');
    assertIncludes(stdout, 'Options:');
  });
});

describe('simple-success', () => {
  it('discovers and runs files', async function () {
    let {stdout} = await runCli('check -d test/examples/simple-success');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 2 files...');
    assertIncludes(stdout, 'All checks succeeded');
  });

  it('runs files from the current directory', async function () {
    await runWithTemplateDir('simple-success', async function () {
      let {stdout} = await runCli('check');
      assertIncludes(stdout, 'Doing a dry run of decaffeinate on 2 files...');
      assertIncludes(stdout, 'All checks succeeded');
    });
  });
});

describe('simple-error', () => {
  it('discovers two files and fails on one', async function () {
    let {stdout} = await runCli('check -d test/examples/simple-error');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 2 files...');
    assertIncludes(stdout, '1 file failed to convert');

    await assertFileIncludes(
      'decaffeinate-errors.log',
      `===== ${join('test', 'examples', 'simple-error', 'error.coffee')}`
    );

    let results = JSON.parse((await readFile('decaffeinate-results.json')).toString());
    assert.equal(results.length, 2);
    assert.equal(results[0].path, join('test', 'examples', 'simple-error', 'error.coffee'));
    assert.notEqual(results[0].error, null);
    assert.equal(results[1].path, join('test', 'examples', 'simple-error', 'success.coffee'));
    assert.equal(results[1].error, null);

    await assertFileContents(
      'decaffeinate-successful-files.txt',
      `${join('test', 'examples', 'simple-error', 'success.coffee')}`
    );
  });
});

describe('file-list', () => {
  it('reads a path file containing two lines, and ignores the other file', async function () {
    let {stdout} = await runCli('check --path-file test/examples/file-list/files-to-decaffeinate.txt');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 3 files...');
    assertIncludes(stdout, 'All checks succeeded');
  });
});

describe('specifying individual files', () => {
  it('allows specifying one file', async function () {
    let {stdout} = await runCli('check --file test/examples/simple-success/A.coffee');
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 1 file...');
    assertIncludes(stdout, 'All checks succeeded');
  });

  it('allows specifying two files', async function () {
    let {stdout} = await runCli(
      `check --file test/examples/simple-success/A.coffee \
        --file test/examples/simple-success/B.coffee`);
    assertIncludes(stdout, 'Doing a dry run of decaffeinate on 2 files...');
    assertIncludes(stdout, 'All checks succeeded');
  });
});

describe('config files', () => {
  it('reads the list of files from a config file', async function () {
    await runWithTemplateDir('simple-config-file', async function () {
      let {stdout, stderr} = await runCli('check');
      assert.equal(stderr, '');
      assertIncludes(stdout, 'Doing a dry run of decaffeinate on 1 file...');
      assertIncludes(stdout, 'All checks succeeded');
    });
  });
});

describe('convert', () => {
  it('generates git commits converting the files', async function () {
    await runWithTemplateDir('simple-success', async function () {
      await initGitRepo();
      let {stdout, stderr} = await runCli('convert');
      assert.equal(stderr, '');
      assertIncludes(stdout, 'Successfully ran decaffeinate');

      let logStdout = (await exec('git log --pretty="%an <%ae> %s"'))[0];
      assert.equal(logStdout, `\
decaffeinate <sample@example.com> decaffeinate: Run post-processing cleanups on A.coffee and 1 other file
decaffeinate <sample@example.com> decaffeinate: Convert A.coffee and 1 other file to JS
decaffeinate <sample@example.com> decaffeinate: Rename A.coffee and 1 other file from .coffee to .js
Sample User <sample@example.com> Initial commit
`
      );
    });
  });

  it('generates a nice commit message when converting just one file', async function () {
    await runWithTemplateDir('simple-success', async function () {
      await initGitRepo();
      let {stdout, stderr} = await runCli('convert --file ./A.coffee');
      assert.equal(stderr, '');
      assertIncludes(stdout, 'Successfully ran decaffeinate');

      let logStdout = (await exec('git log --pretty="%an <%ae> %s"'))[0];
      assert.equal(logStdout, `\
decaffeinate <sample@example.com> decaffeinate: Run post-processing cleanups on A.coffee
decaffeinate <sample@example.com> decaffeinate: Convert A.coffee to JS
decaffeinate <sample@example.com> decaffeinate: Rename A.coffee from .coffee to .js
Sample User <sample@example.com> Initial commit
`
      );
    });

    it('generates a nice commit message when converting three files', async function () {
      await runWithTemplateDir('file-list', async function () {
        await initGitRepo();
        let {stdout} = await runCli('convert --path-file ./files-to-decaffeinate.txt');
        assertIncludes(stdout, 'Successfully ran decaffeinate');

        let logStdout = (await exec('git log --pretty="%an <%ae> %s"'))[0];
        assert.equal(logStdout, `\
decaffeinate <sample@example.com> decaffeinate: Run post-processing cleanups on A.coffee and 2 other files
decaffeinate <sample@example.com> decaffeinate: Convert A.coffee and 2 other files to JS
decaffeinate <sample@example.com> decaffeinate: Rename A.coffee and 2 other files from .coffee to .js
Sample User <sample@example.com> Initial commit
`
        );
      });
    });
  });

  it('runs jscodeshift', async function () {
    await runWithTemplateDir('jscodeshift-test', async function () {
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

  it('runs built-in jscodeshift scripts', async function () {
    await runWithTemplateDir('builtin-jscodeshift-script', async function () {
      await initGitRepo();
      let {stdout, stderr} = await runCli('convert');
      assert.equal(stderr, '');
      assertIncludes(stdout, 'Successfully ran decaffeinate');

      await assertFileContents('./Func.js', `\
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
// This is a comment
function f() {
  console.log('Hello world');
}
`);
    });
  });

  it('prepends "eslint-env mocha" when specified', async function () {
    await runWithTemplateDir('mocha-env-test', async function () {
      await initGitRepo();
      let {stdout} = await runCli('convert');
      assertIncludes(stdout, 'Successfully ran decaffeinate');

      await assertFileContents('./A.js', `\
// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
console.log('This is production code');
`);

      await assertFileContents('./A-test.js', `\
// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/* eslint-env mocha */
console.log('This is test code');
`);
    });
  });

  it('runs eslint, applying fixes and disabling existing issues', async function () {
    await runWithTemplateDir('eslint-fix-test', async function () {
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

  it('fails when .coffee and .js files both exist', async function () {
    await runWithTemplateDir('existing-js-file', async function () {
      await initGitRepo();
      let {stderr} = await runCli('convert');
      assertIncludes(stderr, 'The file A.js already exists.');
    });
  });

  it('fails when the git worktree has changes', async function () {
    await runWithTemplateDir('simple-success', async function () {
      await initGitRepo();
      await exec('echo "x = 2" >> A.coffee');
      let {stderr} = await runCli('convert');
      assertIncludes(stderr, 'You have modifications to your git worktree.');
      await exec('git add A.coffee');
      ({stderr} = await runCli('convert'));
      assertIncludes(stderr, 'You have modifications to your git worktree.');
    });
  });

  it('generates backup files that are removed by clean', async function () {
    await runWithTemplateDir('simple-success', async function () {
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

  it('handles a missing eslint config', async function () {
    await runWithTemplateDir('simple-success', async function () {
      await initGitRepo();
      let cliResult;
      try {
        await rename(join(__dirname, '../../.eslintrc'), join(__dirname, '../../.eslintrc.backup'));
        cliResult = await runCli('convert');
      } finally {
        await rename(join(__dirname, '../../.eslintrc.backup'), join(__dirname, '../../.eslintrc'));
      }
      assert.equal(cliResult.stderr, '');
      assertIncludes(cliResult.stdout, 'because there was no eslint config file');
    });
  });

  it('bypasses git commit hooks', async function () {
    await runWithTemplateDir('simple-success', async function () {
      await initGitRepo();
      if (process.platform === 'win32') {
        await writeFile('.git/hooks/commit-msg.bat', 'exit 1');
      } else {
        await writeFile('.git/hooks/commit-msg', '#!/bin/sh\nexit 1');
        await exec('chmod +x .git/hooks/commit-msg');
      }
      let {stdout, stderr} = await runCli('convert');
      assert.equal(stderr, '');
      assertIncludes(stdout, 'Successfully ran decaffeinate');
      assert.equal((await exec('git rev-list --count HEAD'))[0].trim(), '4');
    });
  });
});

describe('fix-imports', () => {
  async function runFixImportsTest (dirName) {
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
      let changedFiles = (await exec('git status --short --untracked-files=no'))[0];
      assert.equal(changedFiles, '', 'Expected all file changes to be committed.');
    });
  }

  it('handles absolute imports', async function () {
    await runFixImportsTest('fix-imports-absolute-imports');
  });

  it('converts a default import to import * when necessary', async function () {
    await runFixImportsTest('fix-imports-default-import-to-import-star');
  });

  it('properly fixes import statements in pre-existing JS files', async function () {
    await runFixImportsTest('fix-imports-import-from-existing-js');
  });

  it('converts named imports to destructure statements when necessary', async function () {
    await runFixImportsTest('fix-imports-named-import-to-destructure');
  });

  it('properly handles existing JS code using import *', async function () {
    await runFixImportsTest('fix-imports-star-import-from-existing-js');
  });

  it('properly destructures from import * if necessary', async function () {
    await runFixImportsTest('fix-imports-destructure-from-import-star');
  });

  it('properly reads exports when "export function" is used', async function () {
    await runFixImportsTest('fix-imports-export-function');
  });

  it('uses an import * import when necessary even when there are no name usages', async function () {
    await runFixImportsTest('fix-imports-no-name-usages');
  });

  it('only does relative path resolution when an import is relative style', async function () {
    await runFixImportsTest('fix-imports-non-relative-path');
  });
});

describe('test git stuff', function () {
  it('should get status', async function () {
    let x = await gitTrackedStatus();
    console.log(x);
  });
});
