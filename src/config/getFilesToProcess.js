import { exists } from 'mz/fs';
import { resolve } from 'path';

import getCoffeeFilesFromPathFile from './getCoffeeFilesFromPathFile';
import getCoffeeFilesUnderPath from './getCoffeeFilesUnderPath';
import CLIError from '../util/CLIError';

export default async function getFilesToProcess(config) {
  let filesToProcess = await resolveFilesToProcess(config);
  filesToProcess = resolveFileFilter(filesToProcess, config);
  await validateFilesToProcess(filesToProcess);
  return filesToProcess;
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

function resolveFileFilter(filesToProcess, config) {
  if (!config.fileFilterFn) {
    return filesToProcess;
  }
  return filesToProcess.filter(path => config.fileFilterFn(resolve(path)));
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
