import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { getStorageRoot } from '../services/storage/localDisk.js';

function getTmpDir() {
  const root = getStorageRoot();
  const tmpDir = path.resolve(root, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

export const uploadSingle = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, getTmpDir()),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + '.upload'),
  }),
  limits: { fileSize: env.MAX_FILE_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (ok) return cb(null, true);
    cb(new HttpError(415, 'UNSUPPORTED_TYPE', 'Only PDF files are supported'));
  },
}).single('file');
