const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { homedir } = require('os');

const HOSTNAME = process.env.KAPP_HOSTNAME || 'webhooks.kfet-insa.fr';
const DEST_DIR = process.env.DEST_DIR || path.resolve(homedir(), 'kapp-backups');
const TOKEN = process.env.KAPP_TOKEN || '24d9b3912dcf4a09393b8f08653d513be8e5cee1cad556138b8b1f341e23ed435cf29414956a5170';

let currId;

const sleep = timeout => new Promise(resolve => setTimeout(resolve, timeout));

async function doBackup() {
  const res = await fetch(`https://${HOSTNAME}/`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'backup-data',
      token: TOKEN,
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) throw new Error('Error while starting backup');

  const { id } = await res.json();
  currId = id;
}

async function waitForComplete(id) {
  while (true) {
    const res = await fetch(`https://${HOSTNAME}/`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'follow-action',
        token: TOKEN,
        id,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error('Error while following action');

    const { state, metadata } = await res.json();

    if (state === 'COMPLETED') return metadata.link;
    console.log(`Backup in progress (${state}), metadata:`, metadata);

    await sleep(1000);
  }
}

async function downloadBackup(link) {
  const res = await fetch(`https://${HOSTNAME}${link}&token=${TOKEN}`);
  if (!res.ok) throw new Error('Error while downloading backup');

  const [, filename] = /file=(.+)/.exec(link);
  const dest = fs.createWriteStream(path.join(DEST_DIR, filename));
  res.body.pipe(dest);
}

async function main() {
  try {
    await doBackup();
    const link = await waitForComplete(currId);
    console.log(`Backup completed, available at ${link}`);
    await downloadBackup(link);
    console.log('Download completed');
  } catch (e) {
    console.warn('Fail downloading backup', e);
  }
  await sleep(1000 * 60 * 60);
}

main();
