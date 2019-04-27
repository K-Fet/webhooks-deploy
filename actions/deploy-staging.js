const { newReporter } = require('./utils/follow-db');
const { deploy } = require('./utils/deploy');

async function action(req, { tag }) {
  const reporter = await newReporter();

  deploy({ reporter });
}

module.exports = action;
