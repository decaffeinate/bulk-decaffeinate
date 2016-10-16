import { exists, readFile } from 'mz/fs';

import CLIError from '../util/CLIError';

/**
 * Read a list of .coffee files from a file and return it. Verify that all files
 * end in .coffee and that the files actually exist.
 */
export default async function getCoffeeFilesFromPathFile(filePath, requireValidFiles) {
  let fileContents = await readFile(filePath);
  let lines = fileContents.toString().split('\n');
  let resultLines = [];
  for (let line of lines) {
    line = line.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    if (!line.endsWith('.coffee')) {
      if (requireValidFiles) {
        throw new CLIError(`The line "${line}" must be a file path ending in .coffee.`);
      } else {
        continue;
      }
    }
    if (!(await exists(line))) {
      if (requireValidFiles) {
        throw new CLIError(`The file "${line}" did not exist.`);
      } else {
        continue;
      }
    }
    resultLines.push(line);
  }
  return resultLines;
}
