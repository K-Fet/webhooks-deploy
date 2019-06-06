const { newReporter } = require('./utils/follow-db');
const { deploy } = require('./utils/deploy');
const { verifyCommit } = require('./utils/github-verify');

async function action(req, { sha }) {
  if (typeof sha !== 'string') return { status: 400, result: `sha field must be a string, received ${typeof sha}` };

  try {
    await verifyCommit(sha, { branch: 'master' });
  } catch (result) {
    return { status: 400, result };
  }

  const reporter = await newReporter();
  deploy({ reporter, folder: 'kapp-staging', sha });
  return { status: 200, result: reporter.json() };

}

module.exports = action;
