const uuid = require('uuid/v4');

const BASE = 100; // Max advancement
const CLEAN_EVERY = 1000 * 60;
const DELETE_AFTER = 1000 * 60 * 60; // Delete after 1 hr
const MAX_SIZE = 1000;
const tokens = new Map();

class Reporter {
  constructor(id) {
    this.id = id;
    this.startDate = null;
    this.endDate = null;
    this.progress = 0;
    this.state = 'ENQUEUED';
    this.metada = {};
  }

  setTask(task) {
    this.task = task;
  }

  setMetadata(key, value) {
    this.metada[key] = value;
  }

  start() {
    this.state = 'RUNNING';
    this.startDate = new Date();
  }

  cancelTask() {
    if (!this.task) return false;
    this.task.cancel();
    return true;
  }

  failedCancelling() {
    this.state = 'FAILED_CANCELLING';
  }

  cancelling() {
    this.state = 'CANCELLING';
    this.endDate = new Date();
  }

  cancelled() {
    this.state = 'CANCELLED';
    if (!this.endDate) this.endDate = new Date();
  }

  canCancel() {
    return ['RUNNING', 'ENQUEUED'].includes(this.state);
  }

  updateProgress(progress) {
    if (progress >= BASE) {
      this.progress = BASE;
      this.state = 'COMPLETED';
      this.endDate = new Date();
    } else {
      this.progress = progress;
    }
  }

  isEnded() {
    return ['COMPLETED', 'CANCELLED', 'FAILED_CANCELLING'].includes(this.state);
  }

  isDeletable() {
    const threshold = Date.now() - DELETE_AFTER;
    return this.isEnded() && threshold > this.endDate.getTime();
  }

  json() {
    return {
      id: this.id,
      state: this.state,
      progress: this.progress,
      startDate: this.startDate,
      endDate: this.endDate,
      metadata: this.metada,
    };
  }
}


const genId = () => {
  let id = uuid();
  while (tokens.has(id)) id = uuid();
  return id;
};

async function newReporter() {
  // Fail if we hit limit
  if (tokens.size > MAX_SIZE) throw new Error('Not enough size for reporter db');
  const id = genId();
  const reporter = new Reporter(id);
  tokens.set(id, reporter);
  return reporter;
}

async function getReporter(id) {
  return tokens.get(id);
}

module.exports = {
  newReporter,
  getReporter,
};


// Run Map cleaner
clean();

function clean() {
  for (const [id, report] of tokens.entries()) {
    if (report.isDeletable()) tokens.delete(id);
  }

  setTimeout(clean, CLEAN_EVERY);
}
