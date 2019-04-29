const { newReporter } = require('./utils/follow-db');
const { deploy } = require('./utils/deploy');
const { verifyCommit } = require('./utils/github-verify');

async function action(req, { sha }) {
  if (!sha) return { status: 400, result: 'Missing sha field' };

  try {
    await verifyCommit(sha, { branch: 'master' });
  } catch (result) {
    return { status: 400, result };
  }

  const reporter = await newReporter();
  deploy({ reporter, path: 'kapp-staging', sha });
  return { status: 200, result: reporter.json() };

}

module.exports = action;
