import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';
import { Document } from '../../models/Document.js';
import { Chunk } from '../../models/Chunk.js';
import { Generation } from '../../models/Generation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '../../..');

export function getStorageRoot() {
  if (path.isAbsolute(env.STORAGE_DIR)) {
    return env.STORAGE_DIR;
  }
  const serverStorage = path.resolve(serverDir, env.STORAGE_DIR);
  const cwdStorage = path.resolve(process.cwd(), env.STORAGE_DIR);
  if (fsSync.existsSync(serverStorage)) return serverStorage;
  if (fsSync.existsSync(cwdStorage)) return cwdStorage;
  return serverStorage;
}

export function resolveStoragePath(storageKey) {
  const root = getStorageRoot();
  let resolved = path.resolve(root, storageKey);

  // If not found in primary root, check serverStorage or cwdStorage
  if (!fsSync.existsSync(resolved)) {
    const altRoot = path.resolve(serverDir, 'storage');
    const altResolved = path.resolve(altRoot, storageKey);
    if (fsSync.existsSync(altResolved)) {
      resolved = altResolved;
    }
  }

  return resolved;
}

export async function saveUpload(tempPath, documentId) {
  const storageRoot = getStorageRoot();
  const docDir = path.join(storageRoot, String(documentId));
  await fs.mkdir(docDir, { recursive: true });
  const targetPath = path.join(docDir, 'original.pdf');
  await fs.rename(tempPath, targetPath);
  return `${documentId}/original.pdf`;
}

export async function deleteDocumentFiles(documentId) {
  const storageRoot = getStorageRoot();
  const docDir = path.join(storageRoot, String(documentId));
  await fs.rm(docDir, { recursive: true, force: true });
}

export async function deleteDocumentCascade(documentId) {
  await Chunk.deleteMany({ documentId });
  await Generation.deleteMany({ documentId });
  await deleteDocumentFiles(documentId);
  await Document.deleteOne({ _id: documentId });
}
