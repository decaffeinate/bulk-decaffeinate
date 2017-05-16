import { exists } from 'mz/fs';
import { resolve } from 'path';

import getFilesFromPathFile from './getFilesFromPathFile';
import getFilesUnderPath from '../util/getFilesUnderPath';
import getTrackedFiles from '../util/getTrackedFiles';
import { shouldConvertFile, jsPathFor } from '../util/FilePaths';
import CLIError from '../util/CLIError';

/**
 * Get the files that we should process based on the config. "recognizer" should
 * be an object describing the files to auto-recognize, e.g.
 * COFFEE_FILE_RECOGNIZER.
 */
export default async function getFilesToProcess(config, recognizer) {
  let filesToProcess = await resolveFilesToProcess(config, recognizer);
  filesToProcess = resolveFileFilter(filesToProcess, config);
  await validateFilesToProcess(filesToProcess, config);
  return filesToProcess;
}

async function resolveFilesToProcess(config, recognizer) {
  let {filesToProcess, pathFile, searchDirectory} = config;
  if (!filesToProcess && !pathFile && !searchDirectory) {
    let trackedFiles = await getTrackedFiles();
    return await getFilesUnderPath('.', async (path) =>
      await shouldConvertFile(path, recognizer, trackedFiles));
  }
  let files = [];
  if (filesToProcess) {
    files.push(...filesToProcess);
  }
  if (pathFile) {
    files.push(...await getFilesFromPathFile(pathFile));
  }
  if (searchDirectory) {
    let trackedFiles = await getTrackedFiles();
    files.push(...await getFilesUnderPath(searchDirectory, async (path) =>
      await shouldConvertFile(path, recognizer, trackedFiles)));
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
  let trackedFiles = await getTrackedFiles();
  for (let path of filesToProcess) {
    if (!trackedFiles.has(path)) {
      throw new CLIError(`The file ${path} is not tracked in the git repo.`);
    }
    let jsPath = jsPathFor(path, config);
    if (jsPath !== path && await exists(jsPath)) {
      throw new CLIError(`The file ${jsPath} already exists.`);
    }
  }
}
