export const NUM_CONCURRENT_PROCESSES = 4;

/**
 * Run the given one-argument async function on an array of arguments, keeping a
 * logical worker pool to increase throughput without overloading the system.
 *
 * Results are provided as they come in with the result handler. Results look
 * like {index: 3, result: "Hello"}. This can be used e.g. to update a progress
 * bar.
 *
 * An array of all results is returned at the end.
 */
export default async function runInParallel(args, asyncFn, resultHandler) {
  let results = [];
  let activePromises = {};

  let handleResult = ({index, result}) => {
    results[index] = result;
    delete activePromises[index];
    resultHandler({index, result});
  };

  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    activePromises[i] = async function() {
      return {
        index: i,
        result: await asyncFn(arg),
      };
    }();
    if (Object.keys(activePromises).length >= NUM_CONCURRENT_PROCESSES) {
      handleResult(await Promise.race(Object.values(activePromises)));
    }
  }
  while (Object.keys(activePromises).length > 0) {
    handleResult(await Promise.race(Object.values(activePromises)));
  }
  return results;
}
