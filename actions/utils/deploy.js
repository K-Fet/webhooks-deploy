const { SequentialTaskQueue } = require('sequential-task-queue');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

const DEPLOY_FOLDER = '/srv/';
const DEPLOY_TIMEOUT = 1000 * 60 * 60; // 1 hr
const LOGS_FOLDER = path.resolve(__dirname, '..', '..', 'logs');
const deployQueue = new SequentialTaskQueue({});


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
      stdio: [process.stdin, out, err],
    });

    let stdout = '';

    pr.stdout.on('data', (data) => stdout += data.toString());

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
      await spawn('git fetch', { name: `git-fetch-${reporter.id}`, cwd });
    },
    undoTask: null,
  },
  {
    name: 'Saving currentHead',
    task: async ({ cwd, reporter }) => {
      const currentHead = await spawn('git rev-parse HEAD', {
        name: `git-rev-parse-head-${reporter.id}`, cwd,
      });
      return { currentHead };
    },
    undoTask: null,
  },
  {
    name: 'Checkout new ref',
    progress: 25,
    task: async ({ cwd, ref, reporter }) => {
      await spawn('git', ['checkout', ref], { name: `git-checkout-ref-${reporter.id}`, cwd });
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
      await spawn('yarn install --non-interactive --frozen-lockfile', { name: `yarn-install-${reporter.id}`, cwd });
    },
    undoTask: null,
  },
  {
    name: 'K-App backup',
    progress: 65,
    task: async ({ cwd, reporter }) => {
      await spawn('yarn cli backup', { name: `yarn-cli-backup-${reporter.id}`, cwd });
    },
    undoTask: null,
  },
  {
    name: 'K-App migrate',
    progress: 80,
    task: async ({ cwd, reporter }) => {
      await spawn('yarn cli migrate', { name: `yarn-cli-migrate-${reporter.id}`, cwd });
    },
    undoTask: async ({ cwd, reporter }) => {
      await spawn('yarn cli migrate down', { name: `yarn-cli-migrate-down-${reporter.id}`, cwd });
    },
  },
  {
    name: 'K-App restart',
    progress: 100,
    task: async ({ cwd, reporter }) => {
      await spawn('systemctl restart <app_name>@*', { name: `systemctl-restart-${reporter.id}`, cwd });
    },
    undoTask: null,
  },
];


async function taskHandler({ cwd, ref, reporter }, token) {
  const undoStack = [];
  const params = {};

  for (const { name, task, undoTask, progress } of saga) {
    if (token.cancelled) {
      console.log(`[deploy] Action cancelled before task '${name}`);
      reporter.cancelling();
      break;
    }
    console.log(`[deploy] Executing task '${name}`);
    try {
      const newParams = await task({ cwd, ref, reporter, ...params });

      if (progress) reporter.updateProgress(progress);
      if (undoTask) undoStack.push({ name, undoTask });
      if (newParams) Object.assign(params, newParams);
    } catch (e) {
      reporter.cancelling();
      break;
    }
  }

  let cancelFailed = false;

  for (const { name, undoTask } of undoStack) {
    console.log(`[deploy] Cancelling task '${name}`);
    try {
      await undoTask({ cwd, ref, reporter, ...params });
    } catch (e) {
      cancelFailed = true;
      reporter.failedCancelling();
      break;
    }
  }

  if (!cancelFailed) {
    reporter.cancelled();
  }
}

function deploy({ path, ref, reporter }) {
  const cwd = path.resolve(DEPLOY_FOLDER, path);

  const task = deployQueue.push(taskHandler, { args: { cwd, ref, reporter }, timeout: DEPLOY_TIMEOUT });
  reporter.setTask(task);

  return task;
}


module.exports = {
  deploy,
};
