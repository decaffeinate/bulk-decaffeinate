import { exec } from 'mz/child_process';
import { exists, readdir, readFile, stat } from 'mz/fs';
import readline from 'mz/readline';

import getCoffeeFilesFromPathFile from './getCoffeeFilesFromPathFile';
import getCoffeeFilesUnderPath from './getCoffeeFilesUnderPath';
import CLIError from '../util/CLIError';

/**
 * Resolve the configuration from a number of sources: any number of config
 * files and CLI options. Then "canonicalize" the config, e.g. by resolving the
 * list of files to process and inferring any paths if necessary.
 */
export default async function resolveConfig(commander) {
  let config = {};

  let currentDirFiles = await readdir('.');
  currentDirFiles.sort();
  for (let filename of currentDirFiles) {
    if (filename.startsWith('bulk-decaffeinate')
        && filename.endsWith('.json')
        && !(await stat(filename)).isDirectory()) {
      let newConfig = JSON.parse(await readFile(filename));
      config = Object.assign(config, newConfig);
    }
  }
  config = Object.assign(config, getCLIParamsConfig(commander));
  return {
    filesToProcess: await resolveFilesToProcess(config),
    decaffeinatePath: await resolveDecaffeinatePath(config),
  };
}

/**
 * Fill in a configuration from the CLI arguments.
 */
function getCLIParamsConfig(commander) {
  let {pathFile, dir, decaffeinatePath} = commander;
  let config = {};
  if (dir) {
    config.searchDirectory = dir;
  }
  if (pathFile) {
    config.pathFile = pathFile;
  }
  if (decaffeinatePath) {
    config.decaffeinatePath = decaffeinatePath;
  }
  return config;
}

async function resolveFilesToProcess(config) {
  let {filesToProcess, pathFile, searchDirectory} = config;
  if (filesToProcess) {
    return filesToProcess;
  }
  if (pathFile) {
    return await getCoffeeFilesFromPathFile(pathFile);
  }
  if (searchDirectory) {
    return await getCoffeeFilesUnderPath(searchDirectory);
  }
  return await getCoffeeFilesUnderPath('.');
}

/**
 * Determine the decaffeinate path (the shell command) to use for running
 * decaffeinate.
 */
async function resolveDecaffeinatePath(config) {
  if (config.decaffeinatePath) {
    return config.decaffeinatePath;
  }
  let nodeModulesPath = './node_modules/.bin/decaffeinate';
  if (await exists(nodeModulesPath)) {
    return nodeModulesPath;
  } else {
    try {
      await exec('which decaffeinate');
      return 'decaffeinate';
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
      return 'decaffeinate';
    }
  }
}
