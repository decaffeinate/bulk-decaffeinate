import { exec } from 'mz/child_process';
import { exists, readdir, readFile, stat } from 'mz/fs';
import readline from 'mz/readline';
import { resolve } from 'path';
import requireUncached from 'require-uncached';

import getCoffeeFilesFromPathFile from './getCoffeeFilesFromPathFile';
import getCoffeeFilesUnderPath from './getCoffeeFilesUnderPath';
import CLIError from '../util/CLIError';
import execLive from '../util/execLive';

/**
 * Resolve the configuration from a number of sources: any number of config
 * files and CLI options. Then "canonicalize" the config, e.g. by resolving the
 * list of files to process and inferring any paths if necessary.
 *
 * Some commands don't actually use the list of files, so we shouldn't do file
 * sanity checks for those.
 */
export default async function resolveConfig(commander, requireValidFiles = true) {
  let config = {};

  let currentDirFiles = await readdir('.');
  currentDirFiles.sort();
  for (let filename of currentDirFiles) {
    config = await applyPossibleConfig(filename, config);
  }
  config = Object.assign(config, getCLIParamsConfig(commander));
  let filesToProcess = await resolveFilesToProcess(config, requireValidFiles);
  await validateFilesToProcess(filesToProcess);
  return {
    filesToProcess,
    fixImportsConfig: config.fixImportsConfig,
    jscodeshiftScripts: config.jscodeshiftScripts,
    landConfig: config.landConfig,
    mochaEnvFilePattern: config.mochaEnvFilePattern,
    decaffeinatePath: await resolveDecaffeinatePath(config),
    jscodeshiftPath: await resolveJscodeshiftPath(config),
    eslintPath: await resolveEslintPath(config),
  };
}

async function applyPossibleConfig(filename, config) {
  if (!filename.startsWith('bulk-decaffeinate') ||
      (await stat(filename)).isDirectory()) {
    return config;
  }

  let filePath = resolve(filename);
  if (filename.endsWith('.json')) {
    try {
      let newConfig = JSON.parse(await readFile(filePath));
      return Object.assign(config, newConfig);
    } catch (e) {
      throw new CLIError(
        `Error reading file ${filePath}. Make sure it is a valid JSON file.`);
    }
  } else if (filename.endsWith('.config.js')) {
    try {
      let newConfig = requireUncached(filePath);
      return Object.assign(config, newConfig);
    } catch (e) {
      throw new CLIError(
        `Error reading file ${filePath}. Make sure it is a valid JS file.`);
    }
  } else {
    return config;
  }
}

/**
 * Fill in a configuration from the CLI arguments.
 */
function getCLIParamsConfig(commander) {
  let {file, pathFile, dir, decaffeinatePath, jscodeshiftPath, eslintPath} = commander;
  let config = {};
  if (file && file.length > 0) {
    config.filesToProcess = file;
  }
  if (dir) {
    config.searchDirectory = dir;
  }
  if (pathFile) {
    config.pathFile = pathFile;
  }
  if (decaffeinatePath) {
    config.decaffeinatePath = decaffeinatePath;
  }
  if (jscodeshiftPath) {
    config.jscodeshiftPath = jscodeshiftPath;
  }
  if (eslintPath) {
    config.eslintPath = eslintPath;
  }
  return config;
}

async function resolveFilesToProcess(config, requireValidFiles) {
  let {filesToProcess, pathFile, searchDirectory} = config;
  if (filesToProcess) {
    return filesToProcess;
  }
  if (pathFile) {
    return await getCoffeeFilesFromPathFile(pathFile, requireValidFiles);
  }
  if (searchDirectory) {
    return await getCoffeeFilesUnderPath(searchDirectory);
  }
  return await getCoffeeFilesUnderPath('.');
}

async function resolveDecaffeinatePath(config) {
  if (config.decaffeinatePath) {
    return config.decaffeinatePath;
  }
  return await resolveBinary('decaffeinate');
}

async function resolveJscodeshiftPath(config) {
  // jscodeshift is an optional step, so don't prompt to install it if we won't
  // be using it.
  if (!config.jscodeshiftScripts && !config.fixImportsConfig) {
    return null;
  }
  if (config.jscodeshiftPath) {
    return config.jscodeshiftPath;
  }
  return await resolveBinary('jscodeshift');
}

async function resolveEslintPath(config) {
  if (config.eslintPath) {
    return config.eslintPath;
  }
  return await resolveBinary('eslint');
}

/**
 * Determine the shell command that can be used to run the given binary,
 * prompting to globally install it if necessary.
 */
async function resolveBinary(binaryName) {
  let nodeModulesPath = `./node_modules/.bin/${binaryName}`;
  if (await exists(nodeModulesPath)) {
    return nodeModulesPath;
  } else {
    try {
      await exec(`which ${binaryName}`);
      return binaryName;
    } catch (e) {
      console.log(`${binaryName} binary not found on the PATH or in node_modules.`);
      let rl = readline.createInterface(process.stdin, process.stdout);
      let answer = await rl.question(`Run "npm install -g ${binaryName}"? [Y/n] `);
      rl.close();
      if (answer.toLowerCase().startsWith('n')) {
        throw new CLIError(`${binaryName} must be installed.`);
      }
      console.log(`Installing ${binaryName} globally...`);
      await execLive(`npm install -g ${binaryName}`);
      console.log(`Successfully installed ${binaryName}\n`);
      return binaryName;
    }
  }
}

async function validateFilesToProcess(filesToProcess) {
  for (let file of filesToProcess) {
    if (!file.endsWith('.coffee')) {
      throw new CLIError(`The file ${file} did not end with .coffee.`);
    }
    let jsFile = file.substring(0, file.length - '.coffee'.length) + '.js';
    if (await exists(jsFile)) {
      throw new CLIError(`The file ${jsFile} already exists.`);
    }
  }
}
