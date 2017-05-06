import { readdir, stat } from 'mz/fs';
import { join } from 'path';

/**
 * Recursively discover any matching files in the current directory, ignoring
 * things like node_modules and .git.
 */
export default async function getFilesUnderPath(dirPath, asyncPathPredicate) {
  let resultFiles = [];
  let children = await readdir(dirPath);
  for (let child of children) {
    if (['node_modules', '.git'].includes(child)) {
      continue;
    }
    let childPath = join(dirPath, child);
    if ((await stat(childPath)).isDirectory()) {
      let subdirCoffeeFiles = await getFilesUnderPath(childPath, asyncPathPredicate);
      resultFiles.push(...subdirCoffeeFiles);
    } else if (await asyncPathPredicate(childPath)) {
      resultFiles.push(childPath);
    }
  }
  return resultFiles;
}
