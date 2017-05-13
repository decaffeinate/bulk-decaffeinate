import git from 'simple-git/promise';
import { resolve } from 'path';

export default async function getTrackedFiles() {
  let stdout = await git().raw(['ls-files']);
  return new Set(stdout.split('\n').map(s => s.trim()).map(s => resolve(s)));
}
