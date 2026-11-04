import crypto from 'node:crypto';
import fs from 'node:fs';

export function sha256String(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

