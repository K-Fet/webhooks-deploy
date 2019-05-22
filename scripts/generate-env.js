const path = require('path');
const crypto = require('crypto');
const argon2 = require('argon2');
const { writeFile, readFile } = require('fs-extra');

const getStr = map => Array.from(map.entries()).map(([key, value]) => `${key}=${value}`).join('\n');

const getToken = size => crypto.randomBytes(size).toString('hex');

const populateMap = (map, str) =>
  str
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('='))
    .forEach(([key, ...values]) => map.set(key, values.join('=')));

async function run() {
  const envFile = path.resolve(__dirname, '..', '.env');
  const env = new Map();
  const token = getToken(40);

  await populateMap(env, await readFile(envFile, 'utf8'));

  env.set('NODE_ENV', 'production');
  env.set('TOKEN_HASH', await argon2.hash(token));

  await writeFile(envFile, getStr(env));

  console.log('Here is the token:', token);
}

run();
