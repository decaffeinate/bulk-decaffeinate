/* eslint-env mocha */

import {
  assertFileContents,
  runCliExpectSuccess,
  runWithTemplateDir,
} from './test-util';

describe('modernize-js', () => {
  it('discovers and converts JS files', async function() {
    await runWithTemplateDir('simple-modernize', async function() {
      await runCliExpectSuccess('modernize-js');
      await assertFileContents('./A.js', `\
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was updated by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
let a = 1;
`);
    });
  });

  it('does not leave repeated messages when run multiple times', async function() {
    await runWithTemplateDir('simple-modernize', async function() {
      await runCliExpectSuccess('modernize-js');
      await runCliExpectSuccess('modernize-js');
      await assertFileContents('./A.js', `\
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was updated by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
let a = 1;
`);
    });
  });

  it('does not leave a code prefix when there is no lint failure', async function() {
    await runWithTemplateDir('modernize-no-lint-failure', async function() {
      await runCliExpectSuccess('modernize-js');
      await assertFileContents('./A.js', `\
import path from 'path';
path.resolve();
`);
    });
  });

  it('runs jscodeshift scripts', async function() {
    await runWithTemplateDir('modernize-jscodeshift-test', async function() {
      await runCliExpectSuccess('modernize-js');
      await assertFileContents('./A.js', `\
/* eslint-disable
    no-unused-vars,
*/
// TODO: This file was updated by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
let nameAfter = 1;
let notChanged = 2;
`);
    });
  });

});
