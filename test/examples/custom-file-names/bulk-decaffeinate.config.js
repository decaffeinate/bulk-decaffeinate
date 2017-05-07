module.exports = {
  filesToProcess: [
    'A.coffee',
    'dir/B.cjsx',
    'Cakefile',
  ],
  customNames: {
    './Cakefile': 'Cakefile.js',
    './dir/B.cjsx': 'dir/B.ts',
  },
};
