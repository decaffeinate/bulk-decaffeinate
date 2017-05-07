import { exists } from 'mz/fs';
import { resolve } from 'path';

import getFilesFromPathFile from './getFilesFromPathFile';
import getFilesUnderPath from '../util/getFilesUnderPath';
import { shouldConvertFile, isExtensionless, jsPathFor } from '../util/FilePaths';
import CLIError from '../util/CLIError';

export default async function getFilesToProcess(config) {
  let filesToProcess = await resolveFilesToProcess(config);
  filesToProcess = resolveFileFilter(filesToProcess, config);
  await validateFilesToProcess(filesToProcess, config);
  return filesToProcess;
}

async function resolveFilesToProcess(config) {
  let {filesToProcess, pathFile, searchDirectory} = config;
  if (!filesToProcess && !pathFile && !searchDirectory) {
    return await getFilesUnderPath('.', shouldConvertFile);
  }
  let files = [];
  if (filesToProcess) {
    files.push(...filesToProcess);
  }
  if (pathFile) {
    files.push(...await getFilesFromPathFile(pathFile));
  }
  if (searchDirectory) {
    files.push(...await getFilesUnderPath(searchDirectory, shouldConvertFile));
  }
  files = files.map(path => resolve(path));
  files = Array.from(new Set(files)).sort();
  return files;
}

function resolveFileFilter(filesToProcess, config) {
  if (!config.fileFilterFn) {
    return filesToProcess;
  }
  return filesToProcess.filter(path => config.fileFilterFn(path));
}

async function validateFilesToProcess(filesToProcess, config) {
  for (let path of filesToProcess) {
    if (isExtensionless(path)) {
      continue;
    }
    let jsPath = jsPathFor(path, config);
    if (await exists(jsPath)) {
      throw new CLIError(`The file ${jsPath} already exists.`);
    }
  }
}
