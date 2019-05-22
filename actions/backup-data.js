const path = require('path');
const { SequentialTaskQueue } = require('sequential-task-queue');
const fs = require('fs-extra');
const { checkEnv } = require('./utils/helpers');
const { spawn } = require('child_process');
const { newReporter } = require('./utils/follow-db');

const deployQueue = new SequentialTaskQueue({});

const BACKUP_TIMEOUT = 1000 * 60; // 1 min
const BACKUP_FOLDER = '/srv/kapp-backups/';
const TMP_FOLDER = path.resolve(BACKUP_FOLDER, '.tmp');

const doMySQLBackup = ({ host, database, username, password }) => new Promise((resolve, reject) => {
  const wstr = fs.createWriteStream(path.join(TMP_FOLDER, `${database}.sql`));

  const mysqldump = spawn('mysqldump', [
    '-h',
    host,
    '-u',
    username,
    '-p',
    password,
    database,
  ]);

  mysqldump.stdout.pipe(wstr).on('finish', resolve).on('error', reject);
});

const doMongoBackup = ({ uri }) => new Promise((resolve, reject) => {
  const wstr = fs.createWriteStream(path.join(TMP_FOLDER, `mongodump.bin`));

  const mongodump = spawn('mongodump', [
    '--uri',
    uri,
  ]);

  mongodump.stdout.pipe(wstr).on('finish', resolve).on('error', reject);
});

const doGzipFolder = ({ database }) => new Promise((resolve, reject) => {
  const filename = `${(new Date().toISOString())}.${database}.tar.gz`;

  const tar = spawn('tar', [
    '-zcvf',
    path.resolve(BACKUP_FOLDER, filename),
    TMP_FOLDER,
  ]);

  tar.stdout.on('finish', resolve).on('error', reject);
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
    'BACKUP_DIR',
    'KEEP_BACKUPS_FOR',
  );

  const reporter = await newReporter();

  const task = deployQueue.push(doBackup, { args: { reporter }, timeout: BACKUP_TIMEOUT });
  reporter.setTask(task);
  return { status: 200, result: reporter.json() };
}

module.exports = action;
