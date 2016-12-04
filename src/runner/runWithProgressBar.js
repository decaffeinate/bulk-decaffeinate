import runInParallel from './runInParallel';
import pluralize from '../util/pluralize';

const NUM_CONCURRENT_PROCESSES = 8;

/**
 * Run the given command in parallel, showing a progress bar of results.
 *
 * The provided async function should return an object that at least contains
 * a field called "error" that is truthy if there was a problem, but may contain
 * any other fields.
 */
export default async function runWithProgressBar(
    description, files, asyncFn, {runInSeries}={}) {
  let numProcessed = 0;
  let numFailures = 0;
  let numTotal = files.length;
  console.log(description);
  let numConcurrentProcesses = runInSeries ? 1 : NUM_CONCURRENT_PROCESSES;
  let results = await runInParallel(files, asyncFn, numConcurrentProcesses, ({result}) => {
    if (result.error) {
      numFailures++;
    }
    numProcessed++;
    let errorString = numFailures === 0 ? '' : ` (${pluralize(numFailures, 'failure')} so far)`;
    process.stdout.write(`\r${numProcessed}/${numTotal}${errorString}`);
  });
  process.stdout.write('\n');
  return results;
}
