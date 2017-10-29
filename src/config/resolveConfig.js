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

  if (commander.config && commander.config.length > 0) {
    for (let filename of commander.config) {
      config = applyConfig(filename, config);
    }
  } else {
    let currentDirFiles = await readdir('.');
    currentDirFiles.sort();
    for (let filename of currentDirFiles) {
      config = await applyPossibleConfig(filename, config);
    }
  }
  config = getCLIParamsConfig(config, commander);
  return {
    decaffeinateArgs: resolveDecaffeinateArgs(config),
    filesToProcess: config.filesToProcess,
    pathFile: config.pathFile,
    searchDirectory: config.searchDirectory,
    fileFilterFn: config.fileFilterFn,
    customNames: resolveCustomNames(config.customNames),
    outputFileExtension: config.outputFileExtension || 'js',
    fixImportsConfig: resolveFixImportsConfig(config),
    jscodeshiftScripts: config.jscodeshiftScripts,
    landConfig: config.landConfig,
    mochaEnvFilePattern: config.mochaEnvFilePattern,
    codePrefix: config.codePrefix,
    landBase: config.landBase,
    numWorkers: config.numWorkers || 8,
    skipVerify: config.skipVerify,
    decaffeinatePath: await resolveDecaffeinatePath(config),
    jscodeshiftPath: await resolveJscodeshiftPath(config),
    eslintPath: await resolveEslintPath(config),
  };
}

function resolveDecaffeinateArgs(config) {
  let args = config.decaffeinateArgs || [];
  if (config.useJSModules && !args.includes('--use-js-modules')) {
    args.push('--use-js-modules');
  }
  return args;
}

function resolveFixImportsConfig(config) {
  let fixImportsConfig = config.fixImportsConfig;
  if (!fixImportsConfig && config.useJSModules) {
    fixImportsConfig = {
      searchPath: '.',
    };
  }
  return fixImportsConfig;
}

async function applyPossibleConfig(filename, config) {
  if (!filename.startsWith('bulk-decaffeinate') ||
      (await stat(filename)).isDirectory()) {
    return config;
  }

  if (filename.endsWith('.config.js')) {
    return applyConfig(filename, config);
  } else {
    return config;
  }
}

function applyConfig(filename, config) {
  let filePath = resolve(filename);
  try {
    let newConfig = requireUncached(filePath);
    return Object.assign(config, newConfig);
  } catch (e) {
    throw new CLIError(
      `Error reading file ${filePath}. Make sure it is a valid JS file.`);
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
    useJsModules,
    landBase,
    numWorkers,
    skipVerify,
    decaffeinatePath,
    jscodeshiftPath,
    eslintPath,
  } = commander;
  // As a special case, specifying files to process from the CLI should cause
  // any equivalent config file settings to be ignored.
  if ((file && file.length > 0) || dir || pathFile) {
    config.filesToProcess = null;
    config.searchDirectory = null;
    config.pathFile = null;
  }

  if (file && file.length > 0) {
    config.filesToProcess = file;
  }
  if (dir) {
    config.searchDirectory = dir;
  }
  if (pathFile) {
    config.pathFile = pathFile;
  }
  if (useJsModules) {
    config.useJSModules = true;
  }
  if (landBase) {
    config.landBase = landBase;
  }
  if (numWorkers) {
    config.numWorkers = numWorkers;
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
  if (!config.jscodeshiftScripts && !config.fixImportsConfig && !config.useJSModules) {
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

function resolveCustomNames(customNames) {
  let result = {};
  if (customNames) {
    for (const [key, value] of Object.entries(customNames)) {
      result[resolve(key)] = resolve(value);
    }
  }
  return result;
}
