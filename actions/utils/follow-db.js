const uuid = require('uuid/v4');

const BASE = 100; // Max advancement
const CLEAN_EVERY = 60;
const MAX_SIZE = 1000;
const tokens = new Map();

class NewReport {
  constructor(id, { ttl, onCancel }) {
    this.id = id;
    this.startDate = new Date();
    this.endDate = null;
    this.ttl = ttl || 3600;
    this.progress = 0;
    this.completed = false;
    this.onCancel = onCancel;
  }

  updateProgress(progress) {
    if (progress >= BASE) {
      this.progress = BASE;
      this.completed = true;
      this.endDate = new Date();
    } else {
      this.progress = progress;
    }
  }

  isDead() {
    const diff = start - (1000 * this.ttl);
    return diff < 0;
  }

  json() {
    return {
      id: this.id,
      completed: this.completed,
      progress: this.progress,
      startDate: this.startDate,
      endDate: this.endDate,
    };
  }
}


const genId = () => {
  let id = uuid();
  while (tokens.has(id)) id = uuid();
  return id;
};


async function newReport({ ttl, onCancel }) {
  // Fail if we hit limit
  if (tokens.size > MAX_SIZE) throw new Error('Not enough size for report db');
  const id = genId();
  tokens.set(id, new NewReport(id, { ttl, onCancel }));
  return id;
}

async function getReport(id) {
  return tokens.get(id);
}

module.exports = {
  newReport,
  getReport,
};


// Run Map cleaner
clean();

function clean() {
  for (const [id, report] of tokens.entries()) {
    if (!report.isDead()) continue;
    if (typeof report.onCancel === 'function') report.onCancel();
    tokens.delete(id);
  }

  setTimeout(clean, CLEAN_EVERY);
}
