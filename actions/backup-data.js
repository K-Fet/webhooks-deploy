const path = require('path');
const { SequentialTaskQueue } = require('sequential-task-queue');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { newReporter } = require('./utils/follow-db');

const deployQueue = new SequentialTaskQueue({});

const BACKUP_TIMEOUT = 1000 * 60; // 1 min
const BACKUP_FOLDER = '/srv/kapp-backups/';
const TMP_FOLDER = path.resolve(BACKUP_FOLDER, '.tmp');

const doMySQLBackup = () => new Promise((resolve, reject) => {
  const database = 'kapp';
  const wstr = fs.createWriteStream(path.join(TMP_FOLDER, `${database}.sql`));

  const mysqldump = spawn('mysqldump', [
    '-u',
    // Username
    '-p',
    // Password
    database,
  ]);

  mysqldump.stdout.pipe(wstr).on('finish', resolve).on('error', reject);
});

const doMongoBackup = () => new Promise((resolve, reject) => {
  const database = 'kapp';
  const wstr = fs.createWriteStream(path.join(TMP_FOLDER, `${database}.mongodump`));

  const mongodump = spawn('mongodump', [
    '--uri',
    // URI (with database)
  ]);

  mongodump.stdout.pipe(wstr).on('finish', resolve).on('error', reject);
});

const doGzipFolder = () => new Promise((resolve, reject) => {
  const database = 'kapp';
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

  // Prepare temp folder
  await fs.ensureDir(TMP_FOLDER);
  await fs.emptyDir(TMP_FOLDER);

  // Backup MySQL
  await doMySQLBackup();

  // Backup MongoDB
  await doMongoBackup();

  // Zip content and save it
  await doGzipFolder();

  // Delete old backups
  await deleteOldBackups(BACKUP_FOLDER, 30);

  // Cleanup temp folder
  await fs.emptyDir(TMP_FOLDER);
}


async function action(req, {}) {
  const reporter = await newReporter();

  const task = deployQueue.push(doBackup, { args: { reporter }, timeout: BACKUP_TIMEOUT });
  reporter.setTask(task);
  return { status: 200, result: reporter.json() };
}

module.exports = action;
