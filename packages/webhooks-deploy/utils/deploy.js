const { SequentialTaskQueue } = require('sequential-task-queue');
const cp = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { simpleBackup } = require('../actions/backup-data');

const DEPLOY_FOLDER = '/srv/';
const DEPLOY_TIMEOUT = 1000 * 60 * 60; // 1 hr
const LOGS_FOLDER = path.resolve('logs');
const deployQueue = new SequentialTaskQueue({});

deployQueue.on('error', err => console.warn('Error in deploy queue: ', err));
deployQueue.on('timeout', err => console.warn('Task timed out in deploy queue: ', err));

const spawn = (command, args, opts) => {
  if (!Array.isArray(args)) {
    opts = args;
    args = [];
  }

  const { name, cwd } = opts;
  return new Promise((resolve, reject) => {
    // Create out log streams
    const out = fs.openSync(path.resolve(LOGS_FOLDER, `${name}.out.log`), 'a');
    const err = fs.openSync(path.resolve(LOGS_FOLDER, `${name}.err.log`), 'a');

    const pr = cp.spawn(command, args, {
      cwd,
      stdio: [process.stdin, 'pipe', err],
    });

    let stdout = '';

    pr.stdout.on('data', (data) => {
      fs.write(out, data.toString(), err => err ? console.warn(`[logging] Error writing to file ${name}.out.log`, err) : undefined);
      stdout += data.toString();
    });

    pr.on('close', code => {
      fs.closeSync(out);
      fs.closeSync(err);

      if (code !== 0) reject(code);
      resolve(stdout);
    });
  });
};

const saga = [
  {
    name: 'Fetch new refs',
    progress: 10,
    task: async ({ cwd, reporter }) => {
      await spawn('git', ['fetch'], { name: `git-fetch-${reporter.id}`, cwd });
    },
    undoTask: null,
  },
  {
    name: 'Saving currentHead',
    task: async ({ cwd, reporter }) => {
      const currentHead = await spawn('git', ['rev-parse', 'HEAD'], {
        name: `git-rev-parse-head-${reporter.id}`, cwd,
      });
      return { currentHead };
    },
    undoTask: null,
  },
  {
    name: 'Checkout new ref',
    progress: 25,
    task: async ({ cwd, sha, reporter }) => {
      await spawn('git', ['checkout', sha], { name: `git-checkout-ref-${reporter.id}`, cwd });
    },
    undoTask: async ({ cwd, reporter, currentHead }) => {
      await spawn('git', ['checkout', currentHead], { name: `git-checkout-previous-${reporter.id}`, cwd });
    },
  },
  {
    // FIXME: In case of cancelled task, there will be no yarn install
    //  which will be problematic if the server restart before a new version is released.
    //  This problem will be resolved when we move to Yarn PnP!
    name: 'Yarn install',
    progress: 50,
    task: async ({ cwd, reporter }) => {
      await spawn('yarn', ['install', '--non-interactive', '--frozen-lockfile'], {
        name: `yarn-install-${reporter.id}`, cwd,
      });
    },
    undoTask: null,
  },
  {
    name: 'K-App backup',
    progress: 65,
    task: async ({ cwd, reporter }) => {
      await simpleBackup();
    },
    undoTask: null,
  },
  {
    name: 'K-App migrate',
    progress: 80,
    task: async ({ cwd, reporter }) => {
      cwd = path.join(cwd, 'packages/server');
      await spawn('yarn', ['cli', 'migrate'], { name: `yarn-cli-migrate-${reporter.id}`, cwd });
    },
    undoTask: async ({ cwd, reporter }) => {
      cwd = path.join(cwd, 'packages/server');
      await spawn('yarn', ['cli', 'migrate', 'down'], { name: `yarn-cli-migrate-down-${reporter.id}`, cwd });
    },
  },
  {
    name: 'K-App restart',
    progress: 100,
    task: async ({ cwd, reporter }) => {
      await spawn('systemctl', ['restart', `${path.basename(cwd)}@*`], {
        name: `systemctl-restart-${reporter.id}`, cwd,
      });
    },
    undoTask: null,
  },
];


async function taskHandler({ cwd, sha, reporter }, token) {
  reporter.start();
  const undoStack = [];
  const params = {};
  let hasFailed = false;

  for (const { name, task, undoTask, progress } of saga) {
    if (token.cancelled) {
      console.log(`[deploy] Action cancelled before task '${name}`);
      reporter.cancelling();
      break;
    }
    console.log(`[deploy] Executing task '${name}'`);
    try {
      const newParams = await task({ cwd, sha, reporter, ...params });

      if (progress) reporter.updateProgress(progress);
      if (undoTask) undoStack.unshift({ name, undoTask });
      if (newParams) Object.assign(params, newParams);
    } catch (e) {
      console.warn(`[deploy] Error while executing task '${name}'`, e);
      reporter.cancelling();
      hasFailed = true;
      break;
    }
  }

  if (!hasFailed) return;

  let cancelFailed = false;

  for (const { name, undoTask } of undoStack) {
    console.log(`[deploy] Cancelling task '${name}`);
    try {
      await undoTask({ cwd, sha, reporter, ...params });
    } catch (e) {
      console.warn(`[deploy] Error while undoing task '${name}'`, e);
      cancelFailed = true;
      reporter.failedCancelling();
      break;
    }
  }

  if (!cancelFailed) {
    reporter.cancelled();
  }
}

function deploy({ folder, sha, reporter }) {
  const cwd = path.resolve(DEPLOY_FOLDER, folder);

  const task = deployQueue.push(taskHandler, { args: { cwd, sha, reporter }, timeout: DEPLOY_TIMEOUT });
  reporter.setTask(task);

  return task;
}


module.exports = {
  deploy,
};
