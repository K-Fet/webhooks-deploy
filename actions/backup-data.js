const path = require('path');
const { SequentialTaskQueue } = require('sequential-task-queue');
const fs = require('fs-extra');
const { checkEnv } = require('./utils/helpers');
const { spawn } = require('child_process');
const { newReporter } = require('./utils/follow-db');

const deployQueue = new SequentialTaskQueue({});

const BACKUP_TIMEOUT = 1000 * 60; // 1 min
const BACKUP_FOLDER = process.env.BACKUP_FOLDER || './kapp-backups/';
const TMP_FOLDER = path.join(BACKUP_FOLDER, '.tmp');

const doMySQLBackup = ({ host, database, username, password }) => new Promise((resolve, reject) => {
  const wstr = fs.createWriteStream(path.resolve(TMP_FOLDER, `${database}.sql`));

  const mysqldump = spawn('mysqldump', [
    '-h',
    host,
    '-u',
    username,
    `-p${password}`,
    database,
  ]);

  let handled = false;
  const rejectASAP = () => {
    if (handled) return;
    handled = true;
    return reject(code);
  };

  mysqldump.stdout
    .pipe(wstr)
    .on('finish', () => mysqldump.on('exit', code => code ? rejectASAP() : resolve()))
    .on('error', rejectASAP);

  mysqldump.on('error', rejectASAP);
});

const doMongoBackup = ({ uri }) => new Promise((resolve, reject) => {
  const wstr = fs.createWriteStream(path.resolve(TMP_FOLDER, `mongodump.bin`));

  const mongodump = spawn('mongodump', [
    '--archive',
    '--uri',
    uri,
  ]);

  let handled = false;
  const rejectASAP = () => {
    if (handled) return;
    handled = true;
    return reject(code);
  };

  mongodump.stdout
    .pipe(wstr)
    .on('finish', () => mongodump.on('exit', code => code ? rejectASAP() : resolve()))
    .on('error', rejectASAP);

  mongodump.on('error', rejectASAP);
});

const doGzipFolder = ({ database }) => new Promise((resolve, reject) => {
  const dateNow = new Date().toISOString().replace(/:/g, '-');
  const filename = `${dateNow}.${database}.tar.gz`;

  const tar = spawn('tar', [
    '-zcvf',
    filename,
    `${path.basename(TMP_FOLDER)}/*`,
  ], { cwd: path.resolve(BACKUP_FOLDER) });

  tar.on('close', code => code ? reject() : resolve()).on('error', reject);
});

async function deleteOldBackups(backupDir, maxOld) {
  const folderFiles = await fs.readdir(backupDir);

  const backups = await Promise.all(folderFiles
    .filter(f => f.endsWith('.tar.gz'))
    .map(async (b) => {
      const { mtimeMs } = await fs.stat(path.join(backupDir, b));
      return {
        file: path.join(backupDir, b),
        mtimeMs,
      };
    }));

  // maxOld is in number of days
  const limitMs = Date.now() - (maxOld * 1000 * 60 * 60 * 24);

  const deletedFiles = await Promise.all(backups
    .filter(({ mtimeMs }) => mtimeMs < limitMs)
    .map(({ file }) => fs.unlink(file)));

  return deletedFiles.length;
}

async function doBackup({ reporter }) {
  const {
    DB__HOST, DB__USERNAME, DB__PASSWORD, DB__DATABASE, KEEP_BACKUPS_FOR, MONGODB__URL,
  } = process.env;

  reporter.start();

  try {
    // Prepare temp folder
    await fs.ensureDir(TMP_FOLDER);
    await fs.emptyDir(TMP_FOLDER);
    reporter.updateProgress(5);

    // Backup MySQL
    await doMySQLBackup({ host: DB__HOST, username: DB__USERNAME, password: DB__PASSWORD, database: DB__DATABASE });
    reporter.updateProgress(30);

    // Backup MongoDB
    await doMongoBackup({ uri: MONGODB__URL });
    reporter.updateProgress(60);

    // Zip content and save it
    await doGzipFolder({ database: DB__DATABASE });
    reporter.updateProgress(90);

    // Delete old backups
    await deleteOldBackups(BACKUP_FOLDER, KEEP_BACKUPS_FOR);
    reporter.updateProgress(100);

    // Cleanup temp folder
    await fs.emptyDir(TMP_FOLDER);
  } catch (e) {
    console.warn('[backup-data] Unable to backup', e);
    reporter.cancelled();
  }
}


async function action(req, {}) {
  checkEnv(
    'DB__HOST',
    'DB__USERNAME',
    'DB__PASSWORD',
    'DB__DATABASE',
    'KEEP_BACKUPS_FOR',
    'MONGODB__URL',
  );

  const reporter = await newReporter();

  const task = deployQueue.push(doBackup, { args: { reporter }, timeout: BACKUP_TIMEOUT });
  reporter.setTask(task);
  return { status: 200, result: reporter.json() };
}

module.exports = action;
