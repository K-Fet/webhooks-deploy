const { newReporter } = require('./utils/follow-db');
const { deploy } = require('./utils/deploy');
const { verifyCommit } = require('./utils/github-verify');

async function action(req, { sha }) {

  try {
    await verifyCommit(sha, { branch: 'prod' });
  } catch (result) {
    return { status: 400, result };
  }

  const reporter = await newReporter();
  deploy({ reporter, path: 'kapp', sha });
  return { status: 200, result: reporter.json() };

}

module.exports = action;
