import { isLiterate } from '../util/FilePaths';
import makeCLIFn from './makeCLIFn';

export default function makeDecaffeinateVerifyFn(config) {
  let { decaffeinatePath, decaffeinateArgs } = config;
  return makeCLIFn(path => {
    let literateFlag = isLiterate(path) ? '--literate' : '';
    return `${decaffeinatePath} ${literateFlag} ${decaffeinateArgs.join(' ')} < ${path}`;
  });
}
