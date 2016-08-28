import { writeFile } from 'mz/fs';

import getDecaffeinateCommand from './getDecaffeinateCommand';
import resolveFileQuery from './resolveFileQuery';
import runWithProgressBar from './runWithProgressBar';

export default async function check(fileQuery, decaffeinatePath) {
  let {decaffeinateCheckFn} = await getDecaffeinateCommand(decaffeinatePath);
  let coffeeFiles = await resolveFileQuery(fileQuery);
  let decaffeinateResults = await runWithProgressBar(
    `Doing a dry run of decaffeinate on ${coffeeFiles.length} files...`,
    coffeeFiles, decaffeinateCheckFn);
  await printResults(decaffeinateResults);
}

async function printResults(results) {
  let errorResults = results.filter(r => r.error !== null);
  if (errorResults.length === 0) {
    console.log(`All checks succeeded! Decaffeinate can convert all ${results.length} files.`);
    console.log('Run this command again with the convert command');
  } else {
    console.log(`${errorResults.length} files failed to convert:`);
    for (let result of errorResults) {
      console.log(result.path);
    }
    console.log();
    await writeFile('decaffeinate-errors.log', getVerboseErrors(results));
    await writeFile('decaffeinate-results.json', JSON.stringify(results, null, 2));
    console.log('Wrote decaffeinate-errors.log and decaffeinate-results.json with more detailed info.');
    console.log('To open failures in the online repl, run "bulk-decaffeinate view-errors"');
  }
}

function getVerboseErrors(results) {
  let errorMessages = [];
  for (let {path, error} of results) {
    if (error) {
      errorMessages.push(`===== ${path}`);
      errorMessages.push(error);
    }
  }
  return errorMessages.join('\n');
}
