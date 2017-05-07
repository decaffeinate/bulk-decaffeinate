import { unlink } from 'mz/fs';
import { basename } from 'path';

import getFilesUnderPath from './util/getFilesUnderPath';

export default async function clean() {
  let filesToDelete = await getFilesUnderPath('.', p => basename(p).includes('.original'));
  if (filesToDelete.length === 0) {
    console.log('No .original files were found.');
    return;
  }
  for (let path of filesToDelete) {
    console.log(`Deleting ${path}`);
    await unlink(path);
  }
  console.log('Done deleting .original files.');
}
