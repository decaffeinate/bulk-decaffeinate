import { exec } from 'mz/child_process';
import { exists, readdir, stat } from 'mz/fs';
import readline from 'mz/readline';
import { resolve } from 'path';
import requireUncached from 'require-uncached';

import CLIError from '../util/CLIError';
import execLive from '../util/execLive';

/**
 * Resolve the configuration from a number of sources: any number of config
 * files and CLI options. Then "canonicalize" the config as much as we can.
 */
export default async function resolveConfig(commander) {
  let config = {};

  let currentDirFiles = await readdir('.');
  currentDirFiles.sort();
  for (let filename of currentDirFiles) {
    config = await applyPossibleConfig(filename, config);
  }
  config = getCLIParamsConfig(config, commander);
  return {
    decaffeinateArgs: config.decaffeinateArgs || [],
    filesToProcess: config.filesToProcess,
    pathFile: config.pathFile,
    searchDirectory: config.searchDirectory,
    fileFilterFn: config.fileFilterFn,
    fixImportsConfig: config.fixImportsConfig,
    jscodeshiftScripts: config.jscodeshiftScripts,
    landConfig: config.landConfig,
    mochaEnvFilePattern: config.mochaEnvFilePattern,
    codePrefix: config.codePrefix,
    landBase: config.landBase,
    skipVerify: config.skipVerify,
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
  if (filename.endsWith('.config.js')) {
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
function getCLIParamsConfig(config, commander) {
  let {
    file,
    pathFile,
    dir,
    allowInvalidConstructors,
    landBase,
    skipVerify,
    decaffeinatePath,
    jscodeshiftPath,
    eslintPath,
  } = commander;
  if (file && file.length > 0) {
    config.filesToProcess = file;
  }
  if (dir) {
    config.searchDirectory = dir;
  }
  if (pathFile) {
    config.pathFile = pathFile;
  }
  if (allowInvalidConstructors) {
    config.decaffeinateArgs = [...(config.decaffeinateArgs || []), '--allow-invalid-constructors'];
  }
  if (landBase) {
    config.landBase = landBase;
  }
  if (skipVerify) {
    config.skipVerify = true;
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
