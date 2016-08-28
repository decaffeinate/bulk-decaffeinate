import pluralize from './pluralize';
import runInParallel, { NUM_CONCURRENT_PROCESSES } from './runInParallel';

/**
 * Run the given command in parallel, showing a progress bar of results.
 */
export default async function runWithProgressBar(commandName, files, asyncFn) {
  let numProcessed = 0;
  let numFailures = 0;
  let numTotal = files.length;
  console.log(
    `${commandName} on ${pluralize(numTotal, 'file')} using ${NUM_CONCURRENT_PROCESSES} workers...`);
  let results = await runInParallel(files, asyncFn, ({result}) => {
    if (result.error) {
      numFailures++;
    }
    numProcessed++;
    let errorString = numFailures === 0 ? '' : ` (${pluralize(numFailures, 'failures')} so far)`;
    process.stdout.write(`\r${numProcessed}/${numTotal}${errorString}`);
  });
  process.stdout.write('\nDone!\n\n');
  return results;
}
