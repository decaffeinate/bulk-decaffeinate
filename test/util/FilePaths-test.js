/* eslint-env mocha */
import assert from 'assert';
import * as FilePaths from '../../src/util/FilePaths';

describe('FilePaths', () => {
  it('generates correct backup paths', () => {
    assert.equal(FilePaths.backupPathFor('./a/b/foo.coffee'), 'a/b/foo.original.coffee');
    assert.equal(FilePaths.backupPathFor('foo.coffee'), 'foo.original.coffee');
    assert.equal(FilePaths.backupPathFor('foo.coffee.md'), 'foo.original.coffee.md');
    assert.equal(FilePaths.backupPathFor('foo.cjsx'), 'foo.original.cjsx');
    assert.equal(FilePaths.backupPathFor('foo'), 'foo.original');
  });

  it('generates correct js paths', () => {
    assert.equal(FilePaths.jsPathFor('./a/b/foo.coffee'), 'a/b/foo.js');
    assert.equal(FilePaths.jsPathFor('foo.coffee'), 'foo.js');
    assert.equal(FilePaths.jsPathFor('foo.coffee.md'), 'foo.js');
    assert.equal(FilePaths.jsPathFor('foo.cjsx'), 'foo.js');
    assert.equal(FilePaths.jsPathFor('foo'), 'foo');
  });

  it('generates correct decaffeinate out paths', () => {
    assert.equal(FilePaths.decaffeinateOutPathFor('./a/b/foo.coffee'), 'a/b/foo.js');
    assert.equal(FilePaths.decaffeinateOutPathFor('foo.coffee.md'), 'foo.js');
    assert.equal(FilePaths.decaffeinateOutPathFor('foo.cjsx'), 'foo.js');
    assert.equal(FilePaths.decaffeinateOutPathFor('foo'), 'foo.js');
  });
});
