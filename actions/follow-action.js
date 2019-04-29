const { getReporter } = require('./utils/follow-db');

async function action(req, { id }) {
  if (typeof id !== 'string') return { status: 400, result: `id field must be a string, received ${typeof id}` };

  const reporter = await getReporter(id);
  if (reporter) {
    return { status: 200, result: reporter.json() };
  }

  return { status: 400, result: `Could not find id ${id}` };
}

module.exports = action;
