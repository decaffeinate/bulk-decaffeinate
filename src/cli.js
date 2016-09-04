import 'babel-polyfill';
import commander from 'commander';

import check from './check';
import clean from './clean';
import resolveConfig from './config/resolveConfig';
import convert from './convert';
import CLIError from './util/CLIError';
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
    convert: Run decaffeinate on the specified files and generate git commits
      for the transition.
    view-errors: Open failures from the most recent run in an online repl.
    clean: Delete all files ending with .original.coffee in the current
      working directory or any of its subdirectories.`)
    .action(commandArg => command = commandArg)
    .option('-p, --path-file [path]',
      `A file containing the paths of .coffee files to decaffeinate, one
        path per line. Paths can be either absolute or relative to the
        current working directory.`)
    .option('-d, --dir [path]',
      `A directory containing files to decaffeinate. All .coffee files in any
        subdirectory of this directory are considered for decaffeinate.`)
    .option('--decaffeinate-path [path]',
      `The path to the decaffeinate binary. If none is specified, it will be
        automatically discovered from node_modules and then from the PATH.`)
    .option('--jscodeshift-path [path]',
      `The path to the jscodeshift binary. If none is specified, it will be
        automatically discovered from node_modules and then from the PATH.`)
    .option('--eslint-path [path]',
      `The path to the eslint binary. If none is specified, it will be
        automatically discovered from node_modules and then from the PATH.`)
    .parse(process.argv);

  runCommand(command);
}

async function runCommand(command) {
  try {
    if (command === 'check') {
      let config = await resolveConfig(commander);
      await check(config);
    } else if (command === 'convert') {
      let config = await resolveConfig(commander);
      await convert(config);
    } else if (command === 'view-errors') {
      await viewErrors();
    } else if (command === 'clean') {
      await clean();
    } else {
      commander.outputHelp();
    }
  } catch (e) {
    console.error(CLIError.formatError(e));
  }
}
