import CLIError from './CLIError';
import getCoffeeFilesUnderPath from './getCoffeeFilesUnderPath';
import getCoffeeFilesFromPathFile from './getCoffeeFilesFromPathFile';

export default async function resolveFileQuery(fileQuery) {
  if (fileQuery.type === 'pathFile') {
    return await getCoffeeFilesFromPathFile(fileQuery.file);
  } else if (fileQuery.type === 'recursiveSearch') {
    let {path} = fileQuery;
    console.log(`Discovering .coffee files under the directory "${path}"...`);
    let coffeeFiles = await getCoffeeFilesUnderPath(path);
    if (coffeeFiles.length === 0) {
      throw new CLIError('No CoffeeScript files were found.');
    }
    return coffeeFiles;
  }
}
