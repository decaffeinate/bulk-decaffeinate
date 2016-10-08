# This actually references something in node_modules.
NonRelativePath = require 'NonRelativePath'

console.log NonRelativePath.foo

module.exports.foo = 3
