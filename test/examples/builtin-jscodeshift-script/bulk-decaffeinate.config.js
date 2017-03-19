module.exports = {
  decaffeinateArgs: ['--keep-commonjs'],
  jscodeshiftScripts: [
    'prefer-function-declarations.js',
    'remove-coffee-from-imports.js',
    'top-level-this-to-exports.js',
  ],
};
