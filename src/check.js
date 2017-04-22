import { writeFile } from 'mz/fs';

import makeCLIFn from './runner/makeCLIFn';
import runWithProgressBar from './runner/runWithProgressBar';
import pluralize from './util/pluralize';

export default async function check(config) {
  let {filesToProcess, decaffeinateArgs = [], decaffeinatePath} = config;
  let decaffeinateResults = await runWithProgressBar(
    `Doing a dry run of decaffeinate on ${pluralize(filesToProcess.length, 'file')}...`,
    filesToProcess,
    makeCLIFn(path => `${decaffeinatePath} ${decaffeinateArgs.join(' ')} < ${path}`),
    {allowFailures: true});
  await printResults(decaffeinateResults);
}

async function printResults(results) {
  let errorResults = results.filter(r => r.error !== null);
  if (errorResults.length === 0) {
    console.log(`All checks succeeded! decaffeinate can convert all ${pluralize(results.length, 'file')}.`);
    console.log('Run "bulk-decaffeinate convert" to convert the files to JavaScript.');
  } else {
    console.log(`${pluralize(errorResults.length, 'file')} failed to convert:`);
    for (let result of errorResults) {
      console.log(result.path);
    }
    let successPaths = results.filter(r => r.error === null).map(r => r.path);
    console.log();
    await writeFile('decaffeinate-errors.log', getVerboseErrors(results));
    await writeFile('decaffeinate-results.json', JSON.stringify(results, null, 2));
    await writeFile('decaffeinate-successful-files.txt', successPaths.join('\n'));
    console.log('Wrote decaffeinate-errors.log and decaffeinate-results.json with more detailed info.');
    console.log('To open failures in the online repl, run "bulk-decaffeinate view-errors".');
    console.log('To convert the successful files, run "bulk-decaffeinate convert -p decaffeinate-successful-files.txt".');
  }
}

function getVerboseErrors(results) {
  let errorMessages = [];
  for (let {path, error} of results) {
    if (error) {
      errorMessages.push(`===== ${path}`);
      errorMessages.push(getStdout(error));
    }
  }
  return errorMessages.join('\n');
}

function getStdout(message) {
  let matchString = '\nstdin: ';
  if (message.indexOf(matchString) !== -1) {
    return message.substring(message.indexOf(matchString) + matchString.length);
  } else {
    return message.substring(message.indexOf('\n') + 1);
  }
}
