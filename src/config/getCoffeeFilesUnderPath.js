import getFilesUnderPath from '../util/getFilesUnderPath';

/**
 * Recursively discover any .coffee files in the current directory, ignoring
 * things like node_modules and .git.
 */
export default async function getCoffeeFilesUnderPath(dirPath) {
  return await getFilesUnderPath(
    dirPath, p => p.endsWith('.coffee') && !p.endsWith('.original.coffee'));
}
