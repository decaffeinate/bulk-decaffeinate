import Git from 'nodegit';

/**
 * Get the status for all tracked files in git.
 */
export default async function gitTrackedStatus() {
  let repo = await Git.Repository.openExt('.', 0, '');
  return await repo.getStatus({flags: 0});
}
