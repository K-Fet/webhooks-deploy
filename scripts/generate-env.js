const path = require('path');
const crypto = require('crypto');
const argon2 = require('argon2');
const { writeFile } = require('fs').promises;

const getStr = map => Array.from(map.entries()).map(([key, value]) => `${key}=${value}`).join('\n');

const getToken = size => crypto.randomBytes(size).toString('hex');

async function run() {
  const env = new Map();
  const token = getToken(40);

  env.set('NODE_ENV', 'production');
  env.set('TOKEN_HASH', await argon2.hash(token));

  await writeFile(path.resolve(__dirname, '..', '.env'), getStr(env));

  console.log('Here is the token:', token);
}

run();
