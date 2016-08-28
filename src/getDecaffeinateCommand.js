import { exec } from 'mz/child_process';
import { exists } from 'mz/fs';
import readline from 'mz/readline';

import CLIError from './CLIError';

/**
 * Return an async function that runs decaffeinate on a given CoffeeScript file.
 */
export default async function getDecaffeinateCommand(userProvidedCommand) {
  if (userProvidedCommand) {
    return makeDecaffeinateFns(userProvidedCommand);
  }
  let nodeModulesPath = './node_modules/.bin/decaffeinate';
  if (await exists(nodeModulesPath)) {
    return makeDecaffeinateFns(nodeModulesPath);
  } else {
    try {
      await exec('which decaffeinate');
      return makeDecaffeinateFns('decaffeinate');
    } catch (e) {
      console.log('decaffeinate binary not found on the PATH or in node_modules.');
      let rl = readline.createInterface(process.stdin, process.stdout);
      let answer = await rl.question('Run "npm install -g decaffeinate"? [Y/n] ');
      rl.close();
      if (answer.toLowerCase().startsWith('n')) {
        throw new CLIError('decaffeinate must be installed.');
      }
      console.log('Installing decaffeinate globally...');
      console.log((await exec('npm install -g decaffeinate'))[0]);
      return makeDecaffeinateFns('decaffeinate');
    }
  }
}

function makeDecaffeinateFns(decaffeinateCommand) {
  return {
    decaffeinateCheckFn: makeCLIFn(path => `${decaffeinateCommand} < '${path}'`),
    decaffeinateFn: makeCLIFn(path => `${decaffeinateCommand} '${path}'`),
  };
}

function makeCLIFn(commandByPath) {
  return async function(path) {
    try {
      await exec(commandByPath(path));
      return {path, error: null};
    } catch (e) {
      return {path, error: getStdout(e)};
    }
  };
}

function getStdout({message}) {
  let matchString = '\nstdin: ';
  if (message.indexOf(matchString) !== -1) {
    return message.substring(message.indexOf(matchString) + matchString.length);
  } else {
    return message.substring(message.indexOf('\n') + 1);
  }
}
