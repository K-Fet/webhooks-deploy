const fs = require('fs-extra');
const path = require('path');

const BACKUP_FOLDER = path.resolve(process.env.BACKUP_FOLDER || './kapp-backups/');

async function action(req, { file }, res) {
  if (typeof file !== 'string') return { status: 400, result: `file field must be a string, received ${typeof file}` };

  const fullPath = path.resolve(BACKUP_FOLDER, file);

  if (!fullPath.startsWith(BACKUP_FOLDER) || !fs.existsSync(fullPath)) return { status: 404, result: 'File not found' };

  try {
    await new Promise((resolve, reject) => res.download(fullPath, file, err => err ? reject : resolve));
  } catch (result) {
    return { status: 400, result };
  }

  return { skipResponse: true };

}

module.exports = action;
