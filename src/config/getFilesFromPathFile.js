import { exists, readFile } from 'mz/fs';

import CLIError from '../util/CLIError';

/**
 * Read a list of files from a file and return it. Verify that all files
 * actually exist.
 */
export default async function getFilesFromPathFile(filePath) {
  let fileContents = await readFile(filePath);
  let lines = fileContents.toString().split('\n');
  let resultLines = [];
  for (let line of lines) {
    line = line.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    if (!(await exists(line))) {
      throw new CLIError(`The file "${line}" did not exist.`);
    }
    resultLines.push(line);
  }
  return resultLines;
}
