import { unlink } from 'mz/fs';
import getFilesUnderPath from './util/getFilesUnderPath';

export default async function clean() {
  let filesToDelete = await getFilesUnderPath('.', p => p.endsWith('.original.coffee'));
  if (filesToDelete.length === 0) {
    console.log('No .original.coffee files were found.');
    return;
  }
  for (let path of filesToDelete) {
    console.log(`Deleting ${path}`);
    await unlink(path);
  }
  console.log('Done deleting .original.coffee files.');
}
