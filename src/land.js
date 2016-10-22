import { exec } from 'mz/child_process';
import Git from 'nodegit';

import CLIError from './util/CLIError';

/**
 * The land option "packages" a set of commits into a single merge commit that
 * can be pushed. Splitting the decaffeinate work up into different commits
 * allows git to properly track file history when a file is changed from
 * CoffeeScript to JavaScript.
 *
 * A typical use case is that the merge commit will include 4 commits: the three
 * auto-generated decaffeinate commits and a follow-up commit to fix lint
 * errors. Unlike the auto-generated decaffeinate commits, the merge commit is
 * created with the default author name.
 */
export default async function land(config) {
  let remote = config.landConfig && config.landConfig.remote;
  let upstreamBranch = config.landConfig && config.landConfig.upstreamBranch;
  let phabricatorAware = config.landConfig && config.landConfig.phabricatorAware;
  if (!remote) {
    console.log('No remote was specified. Defaulting to origin.');
    remote = 'origin';
  }
  if (!upstreamBranch) {
    console.log('No upstreamBranch was specified. Defaulting to master.');
    upstreamBranch = 'master';
  }
  let remoteBranch = `${remote}/${upstreamBranch}`;
  console.log(`Running fetch for ${remote}.`);
  let repo = await Git.Repository.openExt('.', 0, '');
  await fetch(repo, remote);

  let commits = await getCommits(repo);
  console.log(`Found ${commits.length} commits to use.`);

  let differentialRevisionLine = phabricatorAware ? getDifferentialRevisionLine(commits) : null;

  let remoteRef = await Git.Branch.lookup(repo, remoteBranch, Git.Branch.BRANCH.REMOTE);
  await repo.checkoutRef(remoteRef);
  for (let commit of commits) {
    console.log(`Cherry-picking "${commit.message().split('\n', 1)[0]}"`);
    await Git.Cherrypick.cherrypick(repo, commit, new Git.CherrypickOptions());
    let index = await repo.refreshIndex();
    if (index.hasConflicts()) {
      throw new CLIError(`\
The cherry pick had conflicts.
Please rebase your changes and retry "bulk-decaffeinate land"`);
    }
    let message = commit.message();
    if (phabricatorAware) {
      if (!message.includes('Differential Revision')) {
        message += `\n\n${differentialRevisionLine}`;
      }
    }
    await repo.createCommitOnHead([], commit.author(), repo.defaultSignature(), message);
  }

  console.log(`Creating merge commit on ${remoteBranch}`);
  let cherryPickHeadCommit = await repo.getHeadCommit();
  await repo.checkoutRef(remoteRef);
  let mergeMessage = `Merge decaffeinate changes into ${remoteBranch}`;
  if (phabricatorAware) {
    mergeMessage += `\n\n${differentialRevisionLine}`;
  }
  await createMergeCommit(repo, cherryPickHeadCommit, mergeMessage);
  if (phabricatorAware) {
    console.log('Pulling commit message from Phabricator.');
    await exec('arc amend');
  }
  console.log('');
  console.log('Done. Please verify that the git history looks right.');
  console.log('You can push your changes with a command like this:');
  console.log(`git push ${remote} HEAD:${upstreamBranch}`);
  console.log('If you get a conflict, you should re-run "bulk-decaffeinate land".');
}

async function fetch(repo, remote) {
  await repo.fetch(remote, {
    callbacks: {
      credentials(url, userName) {
        return Git.Cred.sshKeyFromAgent(userName);
      },
    },
  });
}

async function getCommits(repo) {
  let commit = await repo.getHeadCommit();
  let commits = [];
  let i = 0;
  let hasSeenDecaffeinateCommit = false;
  for (i = 0; i < 20; i++) {
    let isDecaffeinateCommit = commit.author().name() === 'decaffeinate';
    if (hasSeenDecaffeinateCommit && !isDecaffeinateCommit) {
      break;
    }
    if (!hasSeenDecaffeinateCommit && isDecaffeinateCommit) {
      hasSeenDecaffeinateCommit = true;
    }
    commits.unshift(commit);
    commit = await commit.parent(0);
  }
  if (i >= 20) {
    throw new CLIError(`\
Searched 20 commits without finding a set of commits to use. Make sure you have
commits with the "decaffeinate" author in your recent git history, and that the
first of those commits is the first commit that you would like to land.`);
  }
  return commits;
}

function getDifferentialRevisionLine(commits) {
  let resultLine = null;
  for (let commit of commits) {
    for (let line of commit.message().split('\n')) {
      if (line.startsWith('Differential Revision')) {
        if (resultLine === null || resultLine === line) {
          resultLine = line;
        } else {
          throw new CLIError(`\
Found multiple different "Differential Revision" lines in the matched commits.
Please set your git HEAD so that only one Phabricator code review is included.`);
        }
      }
    }
  }
  if (resultLine === null) {
    throw new CLIError(`
Expected to find a "Differential Revision" line in at least one commit.`);
  }
  return resultLine;
}

async function createMergeCommit(repo, otherCommit, mergeMessage) {
  let annotatedCommit = await Git.AnnotatedCommit.lookup(repo, otherCommit.id());
  await Git.Merge.merge(repo, annotatedCommit, null, {
    checkoutStrategy: Git.Checkout.STRATEGY.FORCE,
  });
  let index = await repo.refreshIndex();
  if (index.hasConflicts()) {
    throw new CLIError('Unexpected conflict when creating merge commit.');
  }
  await index.write();
  let treeOid = await index.writeTree();
  await repo.createCommit(
    'HEAD',
    repo.defaultSignature(),
    repo.defaultSignature(),
    mergeMessage,
    treeOid,
    [await repo.getHeadCommit(), otherCommit]
  );
  repo.stateCleanup();
}
