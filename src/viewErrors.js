import { exists, readFile } from 'mz/fs';
import readline from 'mz/readline';
import opn from 'opn';

export default async function viewErrors() {
  if (!(await exists('decaffeinate-results.json'))) {
    console.log(
      'decaffeinate-results.json file not found. Please run the "check" command first.');
    return;
  }

  let resultsJson = await readFile('decaffeinate-results.json');
  let results = JSON.parse(resultsJson);
  let filesToOpen = results.filter(r => r.error !== null).map(r => r.path);
  if (filesToOpen.length === 0) {
    console.log('No failures were found!');
    return;
  }

  if (filesToOpen.length > 10) {
    let rl = readline.createInterface(process.stdin, process.stdout);
    let answer = await rl.question(
      `This will open ${filesToOpen.length} browser tabs. Do you want to proceed? [y/N] `);
    rl.close();
    if (!answer.toLowerCase().startsWith('y')) {
      return;
    }
  }
  for (let path of filesToOpen) {
    await openInRepl(path);
  }
}

async function openInRepl(path) {
  let fileContents = await readFile(path);
  let encodedFile = encodeURIComponent(fileContents);
  let url = `http://decaffeinate-project.org/repl/#?evaluate=false&code=${encodedFile}`;
  await opn(url, {wait: false});
}
