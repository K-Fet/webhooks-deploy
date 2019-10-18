const octokit = require('@octokit/rest')();

const BASE_REPO = {
  owner: 'K-Fet',
  repo: 'K-App',
};

async function verifyCommit(sha, { branch }) {
  let commit;
  try {
    commit = await octokit.repos.getCommit({
      ...BASE_REPO,
      commit_sha: sha,
    });
  } catch (e) {
    throw 'This commit doesn\'t exist';
  }

  if (!commit.data.commit.verification.verified) {
    throw 'Commit is not verified by github';
  }

  let branches;
  try {
    branches = await octokit.repos.listBranchesForHeadCommit({
      ...BASE_REPO,
      commit_sha: sha,
    });
  } catch (e) {
    throw 'Error while getting branches for head commit';
  }

  const gBranch = branches.data.find(value => value.name === branch);

  if (!gBranch) throw `Commit is not HEAD on ${gBranch}`;
  if (!gBranch.protected) throw`Branch ${gBranch} is not protected`;
}

module.exports = {
  verifyCommit,
};
