import { readdir, stat } from 'mz/fs';
import { join } from 'path';

/**
 * Recursively discover any .coffee files in the current directory, ignoring
 * things like node_modules and .git.
 */
export default async function getCoffeeFilesUnderPath(dirPath) {
  let resultFiles = [];
  let children = await readdir(dirPath);
  for (let child of children) {
    if (['node_modules', '.git'].includes(child)) {
      continue;
    }
    let childPath = join(dirPath, child);
    if ((await stat(childPath)).isDirectory()) {
      let subdirCoffeeFiles = await getCoffeeFilesUnderPath(childPath);
      resultFiles.push(...subdirCoffeeFiles);
    } else if (child.endsWith('.coffee')) {
      resultFiles.push(childPath);
    }
  }
  return resultFiles;
}
