import { exec } from 'mz/child_process';
import { exists } from 'mz/fs';
import readline from 'mz/readline';

/**
 * Return an async function that runs decaffeinate on a given CoffeeScript file.
 */
export default async function getDecaffeinateFn(userProvidedCommand) {
  if (userProvidedCommand) {
    return makeDecaffeinateFn(userProvidedCommand);
  }
  let nodeModulesPath = './node_modules/.bin/decaffeinate';
  if (await exists(nodeModulesPath)) {
    return makeDecaffeinateFn(nodeModulesPath);
  } else {
    try {
      await exec('which decaffeinate');
      return makeDecaffeinateFn('decaffeinate');
    } catch (e) {
      console.log('decaffeinate binary not found on the PATH or in node_modules.');
      let rl = readline.createInterface(process.stdin, process.stdout);
      let answer = await rl.question('Run "npm install -g decaffeinate"? [Y/n] ');
      rl.close();
      if (answer.toLowerCase().startsWith('n')) {
        console.log('decaffeinate must be installed.');
        return null;
      }
      console.log('Installing decaffeinate globally...');
      console.log((await exec('npm install -g decaffeinate'))[0]);
      return makeDecaffeinateFn('decaffeinate');
    }
  }
}

function makeDecaffeinateFn(decaffeinateCommand) {
  return async function(path) {
    try {
      await exec(`${decaffeinateCommand} < '${path}'`);
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
