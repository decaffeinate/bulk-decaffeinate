/**
 * NOTE: This file must only use node v0.12 features + ES modules.
 */

import babel from 'rollup-plugin-babel';
import json from 'rollup-plugin-json';
import babelrc from 'babelrc-rollup';

var pkg = require('./package.json');
var external = [];

export default {
  entry: 'src/cli.js',
  plugins: [
    json(),
    babel(babelrc())
  ],
  external: external,
  intro: 'require(\'babel-polyfill\');',
  sourceMap: true,
  targets: [
    {
      format: 'cjs',
      dest: pkg['main']
    },
    {
      format: 'es',
      dest: pkg['jsnext:main']
    }
  ]
};
