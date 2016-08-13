import { exists, readFile } from 'mz/fs';

/**
 * Read a list of .coffee files from a file and return it. Verify that all files
 * end in .coffee and that the files actually exist.
 */
export default async function getCoffeeFilesFromPathFile(filePath) {
  let fileContents = await readFile(filePath);
  let lines = fileContents.split('\n');
  for (let line of lines) {
    if (!line.endsWith('.coffee')) {
      throw new Error(`The line "${line}" must be a file path ending in .coffee.`);
    }
    if (!(await exists(line))) {
      throw new Error(`The file "${line}" did not exist.`);
    }
  }
  return lines;
}
