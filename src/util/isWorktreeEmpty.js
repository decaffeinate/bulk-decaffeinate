import git from 'simple-git/promise';

/**
 * Determine if there are any uncommitted changes in the git state.
 */
export default async function isWorktreeEmpty() {
  const status = await git().status();
  return status.files.length === 0;
}
