import 'babel-polyfill';
import commander from 'commander';

import check from './check';
import CLIError from './CLIError';
import viewErrors from './viewErrors';

export default function () {
  let command = null;
  commander
    .arguments('<command>')
    .description(`Run decaffeinate on a set of files.

  Commands:
    check: Try decaffeinate on the specified files and generate a report of
      which files can be converted. By default, all .coffee files in the current
      directory are used.
    view-errors: Open failures from the most recent run in an online repl.`)
    .action(commandArg => command = commandArg)
    .option('-p, --path-file [path]',
      `A file containing the paths of .coffee files to decaffeinate, one
        path per line. Paths can be either absolute or relative to the
        current working directory.`)
    .option('-d, --dir [path]',
      `A directory containing files to decaffeinate. All .coffee files in any
        subdirectory of this directory are considered for decaffeinate.`)
    .parse(process.argv);

  let fileQuery = getFileQuery();

  if (command === 'check') {
    check(fileQuery).catch(handleError);
  } else if (command === 'view-errors') {
    viewErrors().catch(handleError);
  } else {
    commander.outputHelp();
  }
}

function getFileQuery() {
  let pathFile = commander.pathFile;
  let dir = commander.dir;
  if (pathFile) {
    return {
      type: 'pathFile',
      file: pathFile,
    };
  } else if (dir) {
    return {
      type: 'recursiveSearch',
      path: dir,
    };
  } else {
    return {
      type: 'recursiveSearch',
      path: '.',
    };
  }
}

function handleError(error) {
  console.error(CLIError.formatError(error));
}
