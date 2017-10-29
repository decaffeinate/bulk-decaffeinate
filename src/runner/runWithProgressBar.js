import moment from 'moment';
import 'moment-precise-range-plugin';

import runInParallel from './runInParallel';
import CLIError from '../util/CLIError';
import pluralize from '../util/pluralize';

/**
 * Run the given command in parallel, showing a progress bar of results.
 *
 * The provided async function should return an object that at least contains
 * a field called "error" that is truthy if there was a problem, but may contain
 * any other fields.
 */
export default async function runWithProgressBar(
    config, description, files, asyncFn, {runInSeries, allowFailures}={}) {
  let numProcessed = 0;
  let numFailures = 0;
  let numTotal = files.length;
  let startTime = moment();
  let numConcurrentProcesses = runInSeries ? 1 : config.numWorkers;
  console.log(`${description} (${pluralize(numConcurrentProcesses, 'worker')})`);
  let results;
  try {
    results = await runInParallel(files, asyncFn, numConcurrentProcesses, ({result}) => {
      if (result && result.error) {
        if (!allowFailures) {
          throw new CLIError(`Error:\n${result.error}`);
        }
        numFailures++;
      }
      numProcessed++;
      let errorString = numFailures === 0 ? '' : ` (${pluralize(numFailures, 'failure')} so far)`;
      process.stdout.write(`\r${numProcessed}/${numTotal}${errorString}`);
    });
  } finally {
    process.stdout.write('\n');
    console.log(`Finished in ${startTime.preciseDiff() || '0 seconds'} (Time: ${moment().format()})`);
  }
  return results;
}
