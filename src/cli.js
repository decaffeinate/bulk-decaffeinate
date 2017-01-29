import { Command } from 'commander';

import check from './check';
import clean from './clean';
import resolveConfig from './config/resolveConfig';
import convert from './convert';
import land from './land';
import CLIError from './util/CLIError';
import viewErrors from './viewErrors';

async function argParse (argv) {
  let command = null;
  let parser = new Command()
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
                            working directory or any of its subdirectories.
    land: Create a merge commit with al
                            working directory or any of its subdirectories.`)
    .action(commandArg => command = commandArg)
    .option('-f, --file [path]',
      `An absolute or relative path to decaffeinate. This arg may be specified 
                            multiple times.`, (arg, args) => args.concat([arg]), [])
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
                            automatically discovered from node_modules and then from the PATH.`);
  parser.parse(argv);
  return [command, parser];
}

async function runCommand (command, parser) {
  let cmd;
  if (command === 'check') {
    cmd = check;
  } else if (command === 'convert') {
    cmd = convert;
  } else if (command === 'view-errors') {
    cmd = viewErrors;
  } else if (command === 'clean') {
    cmd = clean;
  } else if (command === 'land') {
    cmd = land;
  } else {
    console.log(await (parser.helpInformation()));
    return;
  }
  try {
    let config = await resolveConfig(parser);
    await cmd(config);
  } catch (e) {
    console.error(CLIError.formatError(e));
  }
}

async function cli () {
  let [command, config] = await argParse(process.argv);
  runCommand(command, config);
}
cli.runCommand = runCommand;
cli.argParse = argParse;

export default cli;
