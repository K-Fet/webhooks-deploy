const fetch = require('node-fetch');

const HOSTNAME = process.env.KAPP_HOSTNAME || 'webhooks.kfet-insa.fr';
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

async function waitForComplete({ id }) {
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

    await sleep(2000);
  }
}
