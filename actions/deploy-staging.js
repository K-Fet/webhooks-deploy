const { newReport } = require('./utils/follow-db');

async function action(req, { tag }) {
  const id = await newReport({ onCancel });
}

module.exports = action;
