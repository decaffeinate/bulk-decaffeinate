/* eslint-env mocha */
import assert from 'assert';
import { exec } from 'mz/child_process';
import { exists, writeFile } from 'mz/fs';

import {
  assertFileContents,
  assertIncludes,
  initGitRepo,
  runCli,
  runCliExpectError,
  runWithTemplateDir,
} from './test-util';

describe('convert', () => {
  async function runCliExpectSuccess(command) {
    let {stdout, stderr} = await runCli(command);
    assert(stderr.length === 0, `Nonempty stderr. stderr:\n${stderr}\n\nstdout:\n${stdout}`);
    assertIncludes(stdout, 'Successfully ran decaffeinate');
    return {stdout, stderr};
  }

  it('generates git commits converting the files', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await initGitRepo();
      await runCliExpectSuccess('convert');

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

  it('generates a nice commit message when converting just one file', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await initGitRepo();
      await runCliExpectSuccess('convert --file ./A.coffee');
      let logStdout = (await exec('git log --pretty="%an <%ae> %s"'))[0];
      assert.equal(logStdout, `\
decaffeinate <sample@example.com> decaffeinate: Run post-processing cleanups on A.coffee
decaffeinate <sample@example.com> decaffeinate: Convert A.coffee to JS
decaffeinate <sample@example.com> decaffeinate: Rename A.coffee from .coffee to .js
Sample User <sample@example.com> Initial commit
`
      );
    });

    it('generates a nice commit message when converting three files', async function() {
      await runWithTemplateDir('file-list', async function () {
        await initGitRepo();
        await runCliExpectSuccess('convert --path-file ./files-to-decaffeinate.txt');
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

  it('runs jscodeshift', async function() {
    await runWithTemplateDir('jscodeshift-test', async function() {
      await initGitRepo();
      await runCliExpectSuccess('convert');
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

  it('runs built-in jscodeshift scripts', async function() {
    await runWithTemplateDir('builtin-jscodeshift-script', async function() {
      await initGitRepo();
      await runCliExpectSuccess('convert');
      await assertFileContents('./Func.js', `\
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
let a = require('./A');

// This is a comment
function f() {
  console.log('Hello world');
}

function arrow() {
  return 3 + 4;
}

function arrowWithComment() {
  // This is a comment
  return 5;
}

exports.a = 6;
(function() {
  return this.b = 7;
})();
(() => {
  return exports.c = 8;
})();
class C {
  d() {
    return this.e = 9;
  }
}

return;
`);
    });
  });

  it('prepends "eslint-env mocha" when specified', async function() {
    await runWithTemplateDir('mocha-env-test', async function () {
      await initGitRepo();
      await runCliExpectSuccess('convert');
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

  it('prepends a custom prefix specified', async function() {
    await runWithTemplateDir('code-prefix-test', async function () {
      await initGitRepo();
      await runCliExpectSuccess('convert');
      await assertFileContents('./A.js', `\
/** @babel */
// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
console.log('This is a file');
`);
    });
  });


  it('respects decaffeinate args', async function() {
    await runWithTemplateDir('decaffeinate-args-test', async function () {
      await initGitRepo();
      await runCliExpectSuccess('convert');
      await assertFileContents('./A.js', `\
/* eslint-disable
    no-undef,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
let a = require('b');
module.exports = c;
`);
    });
  });

  it('runs eslint, applying fixes and disabling existing issues', async function() {
    await runWithTemplateDir('eslint-fix-test', async function() {
      await initGitRepo();
      await runCliExpectSuccess('convert');
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
      let message = await runCliExpectError('convert');
      assertIncludes(message, 'The file A.js already exists.');
    });
  });

  it('fails when the git worktree has changes', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await initGitRepo();
      await exec('echo "x = 2" >> A.coffee');
      let message = await runCliExpectError('convert');
      assertIncludes(message, 'You have modifications to your git worktree.');
      await exec('git add A.coffee');
      message = await runCliExpectError('convert');
      assertIncludes(message, 'You have modifications to your git worktree.');
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

  it('handles a missing eslint config', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await initGitRepo();
      let cliResult;
      try {
        await exec('mv ../../../.eslintrc ../../../.eslintrc.backup');
        cliResult = await runCli('convert');
      } finally {
        await exec('mv ../../../.eslintrc.backup ../../../.eslintrc');
      }
      assert.equal(cliResult.stderr, '');
      assertIncludes(cliResult.stdout, 'because there was no eslint config file');
    });
  });

  it('bypasses git commit hooks', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await initGitRepo();
      await writeFile('.git/hooks/commit-msg', '#!/bin/sh\nexit 1');
      await exec('chmod +x .git/hooks/commit-msg');
      await runCliExpectSuccess('convert');
      assert.equal((await exec('git rev-list --count HEAD'))[0].trim(), '4');
    });
  });

  it('allows invalid constructors when specified', async function() {
    await runWithTemplateDir('invalid-subclass-constructor', async function() {
      await initGitRepo();
      await runCliExpectSuccess('convert --allow-invalid-constructors');
    });
  });

  it('does not allow invalid constructors when not specified', async function() {
    await runWithTemplateDir('invalid-subclass-constructor', async function() {
      await initGitRepo();
      let message = await runCliExpectError('convert');
      assertIncludes(message, 'Some files could not be converted with decaffeinate');
    });
  });
});
