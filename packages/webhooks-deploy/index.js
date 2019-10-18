require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const argon2 = require('argon2');
const { json } = require('body-parser');

const app = express();

const PORT = process.env.PORT || 3001;
const TOKEN_HASH = process.env.TOKEN_HASH;

const ACTIONS = {
  'backup-data': require('./actions/backup-data'),
  'dl-backup': require('./actions/dl-backup'),
  'deploy-staging': require('./actions/deploy-staging'),
  'deploy-prod': require('./actions/deploy-prod'),
  'follow-action': require('./actions/follow-action'),
  'cancel-action': require('./actions/cancel-action'),
};

const am = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const checkToken = async (req, res, next) => {
  const { token } = { ...req.body, ...req.query };
  if (!token) return res.sendStatus(403);

  try {
    if (await argon2.verify(TOKEN_HASH, token)) return next();
    return res.sendStatus(403);
  } catch (e) {
    return res.sendStatus(500);
  }
};

const handler = async (req, res) => {
  const { action, ...other } = { ...req.body, ...req.query };

  if (!action) return res.sendStatus(400);

  const runner = ACTIONS[action];
  if (!runner) return res.sendStatus(404);

  try {
    const { status, result, skipResponse } = await runner(req, other, res);
    if (!skipResponse) return res.json(result).status(status).end();
  } catch (e) {
    console.warn(`Error execution action ${action}`, e);
    return res.sendStatus(500).end();
  }
};

// Register routes and listen
app.post('/',
  json(),
  morgan('combined'),
  am(checkToken),
  am(handler),
);

app.get('/',
  json(),
  morgan('combined'),
  am(checkToken),
  am(handler),
);

app.listen(PORT, 'localhost', () => {
  console.log(`Listening on ${PORT}`);
});
