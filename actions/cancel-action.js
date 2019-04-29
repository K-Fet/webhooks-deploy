const { getReporter } = require('./utils/follow-db');

async function action(req, { id }) {
  if (typeof id !== 'string') return { status: 400, result: `id field must be a string, received ${typeof id}` };

  const reporter = await getReporter(id);
  if (reporter) {
    if (!reporter.canCancel()) return { status: 400, result: `Task can't be cancelled. (status: ${reporter.status})` };
    const isCancelling = reporter.cancelTask();
    if (!isCancelling) return { status: 500, result: `No task associated with reporter ${id}` };
    return { status: 200, result: reporter.json() };
  }

  return { status: 400, result: `Could not find id ${id}` };
}

module.exports = action;
