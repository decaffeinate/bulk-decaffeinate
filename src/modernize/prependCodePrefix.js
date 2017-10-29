import prependToFile from '../util/prependToFile';
import runWithProgressBar from '../runner/runWithProgressBar';

export default async function prependCodePrefix(config, jsFiles, codePrefix) {
  await runWithProgressBar(
    config,
    'Adding code prefix to converted files...', jsFiles, async function(path) {
      await prependToFile(path, codePrefix);
      return {error: null};
    });
}
