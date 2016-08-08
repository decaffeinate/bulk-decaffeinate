import 'babel-polyfill';
import commander from 'commander';

import check from './check';
import viewErrors from './viewErrors';

export default function () {
  let command = null;
  commander
    .arguments('<command>')
    .description(`Run decaffeinate on a set of files.

  Commands:
    check: Try decaffeinate on all files in the current directory and generate a
      report of which files can be converted.
    view-errors: Open failures from the most recent run in an online repl.
    `)
    .action(commandArg => command = commandArg)
    .parse(process.argv);

  if (command === 'check') {
    check()
      .catch(error => console.error(error));
  } else if (command === 'view-errors') {
    viewErrors()
      .catch(error => console.error(error));
  } else {
    commander.outputHelp();
  }
}
