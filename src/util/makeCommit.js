import git from 'simple-git';
import path from 'path';

/**
 * Use nodegit to create a git commit at HEAD.
 */
export default async function makeCommit(getFiles, commitMessage, overrideAuthorName) {
  let repo = git();
  let resolvePath = (filePath) => path.relative(repo._baseDir, filePath);
  let files = await getFiles(repo, resolvePath);
  let email = await new Promise(res => repo.raw(['config', '--get', 'user.email'], (err, ret) => res(ret.trim())));
  let opts = overrideAuthorName ? {'--author': `${overrideAuthorName} <${email}>`} : {};
  let p = new Promise(res => repo.commit(commitMessage, files, opts, (err, s) => {
    res(s);
  }));
  return await p;
}
