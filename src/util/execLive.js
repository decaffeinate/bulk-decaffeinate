import { spawn } from 'child_process';

/**
 * Variant of exec that connects stdout, stderr, and stdin, mostly so console
 * output is shown continuously. As with the mz version of exec, this returns a
 * promise that resolves when the shell command finishes.
 */
export default function execLive(command) {
  return new Promise((resolve, reject) => {
    let childProcess = spawn('/bin/sh', ['-c', command], {stdio: 'inherit'});
    childProcess.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject();
      }
    });
  });
}
