import { readFile, writeFile } from 'fs-promise';

export default async function prependToFile(path, prependText) {
  let contents = await readFile(path);
  let lines = contents.toString().split('\n');
  if (lines[0] && lines[0].startsWith('#!')) {
    contents = lines[0] + '\n' + prependText + lines.slice(1).join('\n');
  } else {
    contents = prependText + contents;
  }
  await writeFile(path, contents);
}
