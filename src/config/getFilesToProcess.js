import { exists } from 'mz/fs';
import { resolve } from 'path';

import getFilesFromPathFile from './getFilesFromPathFile';
import getFilesUnderPath from '../util/getFilesUnderPath';
import { coffeePathPredicate, jsPathFor } from '../util/FilePaths';
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
    return await getFilesFromPathFile(pathFile);
  }
  if (searchDirectory) {
    return await getFilesUnderPath(searchDirectory, coffeePathPredicate);
  }
  return await getFilesUnderPath('.', coffeePathPredicate);
}

function resolveFileFilter(filesToProcess, config) {
  if (!config.fileFilterFn) {
    return filesToProcess;
  }
  return filesToProcess.filter(path => config.fileFilterFn(resolve(path)));
}

async function validateFilesToProcess(filesToProcess) {
  for (let file of filesToProcess) {
    if (await exists(jsPathFor(file))) {
      throw new CLIError(`The file ${jsPathFor(file)} already exists.`);
    }
  }
}
