/* eslint-env mocha */
import assert from 'assert';
import { exec } from 'mz/child_process';

import {
  assertFilesEqual,
  assertIncludes,
  initGitRepo,
  runCli,
  runWithTemplateDir,
} from './test-util';
import getFilesUnderPath from '../src/util/getFilesUnderPath';

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
      let changedFiles = (await exec('git status --short --untracked-files=no'))[0];
      assert.equal(changedFiles, '', 'Expected all file changes to be committed.');
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

  it('only does relative path resolution when an import is relative style', async function() {
    await runFixImportsTest('fix-imports-non-relative-path');
  });

  it('makes no changes when the other file is not a JS module', async function() {
    await runFixImportsTest('fix-imports-import-commonjs');
  });
});
