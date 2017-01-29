import Git from 'simple-git';
import path from 'path';

/**
 * Use nodegit to create a git commit at HEAD.
 */
export default async function makeCommit(indexTransform, commitMessage, overrideAuthorName) {
  let repo = await Git.Repository.openExt('.', 0, '');
  let index = await repo.refreshIndex();
  let resolvePath = (filePath) => path.relative(`${repo.path()}/..`, filePath);
  await indexTransform(index, resolvePath);
  await index.write();
  let treeOid = await index.writeTree();
  let head = await repo.getHeadCommit();

  let signature = repo.defaultSignature();
  let authorName = overrideAuthorName ? overrideAuthorName : signature.name();
  let authorSignature = Git.Signature.create(
    authorName, signature.email(), signature.when().time(), signature.when().offset());
  await repo.createCommit(
    'HEAD',
    authorSignature,
    signature,
    commitMessage,
    treeOid,
    head ? [head] : null);
}
