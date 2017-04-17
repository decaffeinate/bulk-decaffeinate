import { exec } from 'mz/child_process';
import git from 'simple-git/promise';

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
  await git().fetch([remote]);

  let commits = await getCommits(config);
  console.log(`Found ${commits.length} commits to use.`);

  let differentialRevisionLine = phabricatorAware ? await getDifferentialRevisionLine(commits) : null;

  await git().checkout(remoteBranch);
  for (let commit of commits) {
    console.log(`Cherry-picking "${commit.message}"`);
    await git().raw(['cherry-pick', commit.hash]);
    let status = await git().status();
    if (status.conflicted.length > 0) {
      throw new CLIError(`\
The cherry pick had conflicts.
Please rebase your changes and retry "bulk-decaffeinate land"`);
    }
    let message = await getCommitMessage(commit.hash);
    if (phabricatorAware) {
      if (!message.includes('Differential Revision')) {
        message += `\n\n${differentialRevisionLine}`;
        await git().commit(message, ['--amend']);
      }
    }
  }

  console.log(`Creating merge commit on ${remoteBranch}`);
  let cherryPickHeadCommit = (await git().revparse(['HEAD'])).trim();
  await git().checkout(remoteBranch);

  let mergeMessage = `Merge decaffeinate changes into ${remoteBranch}`;
  if (phabricatorAware) {
    mergeMessage += `\n\n${differentialRevisionLine}`;
  }
  await git().mergeFromTo(cherryPickHeadCommit, 'HEAD', ['--no-ff']);
  await git().commit(mergeMessage, ['--amend']);
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

async function getCommits(config) {
  let explicitBase = null;
  if (config.landBase) {
    explicitBase = (await git().revparse([config.landBase])).trim();
  }

  let allCommits;
  try {
    allCommits = (await git().log({from: 'HEAD', to: 'HEAD~20'})).all;
  } catch (e) {
    allCommits = (await git().log({from: 'HEAD'})).all;
  }

  let commits = [];
  let hasSeenDecaffeinateCommit = false;

  for (let commit of allCommits) {
    let isDecaffeinateCommit = commit.author_name === 'decaffeinate';
    if (explicitBase !== null) {
      if (explicitBase === commit.hash) {
        return commits;
      }
    } else {
      if (hasSeenDecaffeinateCommit && !isDecaffeinateCommit) {
        return commits;
      }
    }
    if (!hasSeenDecaffeinateCommit && isDecaffeinateCommit) {
      hasSeenDecaffeinateCommit = true;
    }
    commits.unshift(commit);
  }
  throw new CLIError(`\
Searched 20 commits without finding a set of commits to use. Make sure you have
commits with the "decaffeinate" author in your recent git history, and that the
first of those commits is the first commit that you would like to land.`);
}

async function getDifferentialRevisionLine(commits) {
  let resultLine = null;
  for (let commit of commits) {
    let commitMessage = await getCommitMessage(commit.hash);
    for (let line of commitMessage.split('\n')) {
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

async function getCommitMessage(commitHash) {
  return await git().show(['-s', '--format=%B', commitHash]);
}
