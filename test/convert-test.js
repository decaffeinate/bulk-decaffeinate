/* eslint-env mocha */
import assert from 'assert';
import { exec } from 'mz/child_process';
import { readFile, writeFile } from 'mz/fs';
import git from 'simple-git/promise';

import {
  assertExists,
  assertNotExists,
  assertFileContents,
  assertIncludes,
  runCli,
  runCliExpectSuccess,
  runCliExpectError,
  runWithTemplateDir,
} from './test-util';

describe('convert', () => {
  it('generates git commits converting the files', async function() {
    await runWithTemplateDir('simple-success', async function() {
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
  });

  it('generates a nice commit message when converting three files', async function() {
    await runWithTemplateDir('file-list', async function () {
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

  it('combines multiple path specifiers', async function() {
    await runWithTemplateDir('multiple-path-specifiers', async function () {
      await runCliExpectSuccess('convert');
      await assertExists('./A.js');
      await assertExists('./B.js');
      await assertExists('./C.js');
      await assertExists('./D.coffee');
      await assertExists('./dir1/E.js');
      await assertExists('./dir1/F.js');
      await assertExists('./dir2/G.coffee');
      await assertExists('./dir2/H.js');
    });
  });

  it('converts literate coffeescript', async function() {
    await runWithTemplateDir('literate-coffeescript', async function () {
      await runCliExpectSuccess('convert');
      await assertFileContents('./A.js', `\
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
const a = 1;
`);
      await assertFileContents('./B.js', `\
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
// This is a literate file.
const b = 1;
`);
      await assertFileContents('./C.js', `\
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
// This is another literate file.
const c = 1;
`);
    });
  });

  it('runs jscodeshift', async function() {
    await runWithTemplateDir('jscodeshift-test', async function() {
      await runCliExpectSuccess('convert');
      await assertFileContents('./A.js', `\
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
const nameAfter = 3;
const notChanged = 4;
`);
    });
  });

  it('runs built-in jscodeshift scripts', async function() {
    await runWithTemplateDir('builtin-jscodeshift-script', async function() {
      await runCliExpectSuccess('convert');
      await assertFileContents('./Func.js', `\
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS208: Avoid top-level this
 * DS209: Avoid top-level return
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const a = require('./A');

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
      await runCliExpectSuccess('convert');
      await assertFileContents('./A.js', `\
/* eslint-disable
    no-undef,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
const a = require('b');
module.exports = c;
`);
    });
  });

  it('allows converting extensionless scripts', async function() {
    await runWithTemplateDir('extensionless-script', async function () {
      await runCliExpectSuccess('convert');
      await assertFileContents('./runThing', `\
#!/usr/bin/env node
// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.

console.log('Ran the thing!');
`);
    });
  });

  it('automatically discovers and converts extensionless scripts', async function() {
    await runWithTemplateDir('executable-extensionless-scripts', async function () {
      let untouchedContents1 = (await readFile('./executableScriptWithoutShebang')).toString();
      let untouchedContents2 = (await readFile('./executableScriptWithWrongShebang')).toString();
      let untouchedContents3 = (await readFile('./nonExecutableScript')).toString();

      await runCliExpectSuccess('convert');

      await assertFileContents('./executableScript', `\
#!/usr/bin/env node
// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.

console.log('This script is executable so it should be converted.');
`);
      await assertFileContents('./bin/nestedExecutableScript', `\
#!/usr/bin/env node
// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.

console.log('This nested script is executable so it should be converted.');
`);
      await assertFileContents('./executableScriptWithoutShebang', untouchedContents1);
      await assertFileContents('./executableScriptWithWrongShebang', untouchedContents2);
      await assertFileContents('./nonExecutableScript', untouchedContents3);
    });
  });

  it('allows converting a directory with no files', async function() {
    await runWithTemplateDir('empty-directory', async function () {
      let {stdout, stderr} = await runCli('convert');
      assert(stderr.length === 0, `Nonempty stderr. stderr:\n${stderr}\n\nstdout:\n${stdout}`);
      assertIncludes(stdout, 'There were no CoffeeScript files to convert.');
    });
  });

  it('runs eslint, applying fixes and disabling existing issues', async function() {
    await runWithTemplateDir('eslint-fix-test', async function() {
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
      let message = await runCliExpectError('convert');
      assertIncludes(message, 'A.js already exists.');
    });
  });

  it('fails when the git worktree has changes, staged or unstaged', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await exec('echo "x = 2" >> A.coffee');
      let message = await runCliExpectError('convert');
      assertIncludes(message, 'You have modifications to your git worktree.');
      await exec('git add A.coffee');
      message = await runCliExpectError('convert');
      assertIncludes(message, 'You have modifications to your git worktree.');
    });
  });

  it('warns when the git worktree has untracked changes', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await exec('echo "x = 2" >> new-file.coffee');
      await exec('echo "x = 2" >> other-new-file.coffee');
      let {stdout} = await runCliExpectSuccess('convert');
      assertIncludes(stdout, `\
Warning: the following untracked files are present in your repository:
new-file.coffee
other-new-file.coffee
Proceeding anyway.`);
      let status = await git().status();
      assert.deepEqual(status.not_added, [
        'A.original.coffee',
        'B.original.coffee',
        'new-file.coffee',
        'other-new-file.coffee',
      ]);
    });
  });

  it('errors when explicitly specifying an untracked file', async function() {
    await runWithTemplateDir('simple-success', async function() {
      await exec('echo "x = 2" >> new-file.coffee');
      let message = await runCliExpectError('convert -f ./new-file.coffee');
      assertIncludes(message, 'is not tracked in the git repo.');
    });
  });

  it('generates backup files that are removed by clean', async function() {
    await runWithTemplateDir('backup-files', async function() {
      await runCli('convert');
      await assertExists('./A.original.coffee');
      await assertExists('./B.original.coffee.md');
      await assertExists('./C.original');
      await runCli('clean');
      await assertNotExists('./A.original.coffee');
      await assertNotExists('./B.original.coffee.md');
      await assertNotExists('./C.original');
    });
  });

  it('properly handles custom names', async function() {
    await runWithTemplateDir('custom-file-names', async function() {
      await runCli('convert');
      await assertExists('./A.js');
      await assertExists('./dir/B.ts');
      await assertExists('./Cakefile.js');
    });
  });

  it('allows a custom file extension', async function() {
    await runWithTemplateDir('convert-to-typescript', async function() {
      await runCli('convert');
      await assertExists('./A.ts');
    });
  });

  it('handles a missing eslint config', async function() {
    await runWithTemplateDir('simple-success', async function() {
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
      await writeFile('.git/hooks/commit-msg', '#!/bin/sh\nexit 1');
      await exec('chmod +x .git/hooks/commit-msg');
      await runCliExpectSuccess('convert');
      assert.equal((await exec('git rev-list --count HEAD'))[0].trim(), '4');
    });
  });

  it('allows skipping eslint --fix', async function() {
    await runWithTemplateDir('skip-eslint-fix', async function() {
      const {stdout} = await runCliExpectSuccess('convert');
      assert(!stdout.includes('Running eslint'), 'Expected eslint to be skipped.');
    });
  });
});
