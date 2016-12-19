import { exec } from 'mz/child_process';

export default function makeCLIFn(commandByPath) {
  return async function(path) {
    try {
      await exec(commandByPath(path), {maxBuffer: 5 * 1024 * 1024});
      return {path, error: null};
    } catch (e) {
      return {path, error: e.message};
    }
  };
}
