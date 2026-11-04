import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { Document } from '../models/Document.js';
import { Chunk } from '../models/Chunk.js';
import { HttpError } from '../utils/httpError.js';
import { sha256File } from '../utils/hash.js';
import { env } from '../config/env.js';
import { saveUpload, resolveStoragePath, deleteDocumentCascade } from '../services/storage/index.js';
import { runPipeline } from '../services/ingest/pipeline.js';

export async function createDocument(req, res) {
  if (!req.file) {
    throw new HttpError(400, 'NO_FILE', 'No file uploaded');
  }

  const tempPath = req.file.path;
  let newDoc = null;

  try {
    const handle = await fsPromises.open(tempPath, 'r');
    const buf = Buffer.alloc(5);
    await handle.read(buf, 0, 5, 0);
    await handle.close();

    if (buf.toString('utf-8') !== '%PDF-') {
      await fsPromises.unlink(tempPath).catch(() => {});
      throw new HttpError(415, 'NOT_A_PDF', 'This file is not a valid PDF');
    }

    const fileHash = await sha256File(tempPath);
    const existing = await Document.findOne({
      ownerGuestId: req.guestId,
      fileHash,
      status: 'ready',
      expiresAt: { $gt: new Date() },
    });

    if (existing) {
      await fsPromises.unlink(tempPath).catch(() => {});
      return res.status(200).json({ document: existing, reused: true });
    }

    const expiresAt = new Date(Date.now() + env.GUEST_TTL_DAYS * 24 * 60 * 60 * 1000);
    const originalName = path.basename(req.file.originalname).slice(0, 200);

    newDoc = await Document.create({
      ownerGuestId: req.guestId,
      originalName,
      mimeType: 'application/pdf',
      sizeBytes: req.file.size,
      storageKey: 'pending',
      fileHash,
      status: 'uploaded',
      expiresAt,
    });

    const storageKey = await saveUpload(tempPath, newDoc._id);
    newDoc.storageKey = storageKey;
    await newDoc.save();

    setImmediate(() => {
      runPipeline(newDoc._id);
    });

    return res.status(202).json({ document: newDoc, reused: false });
  } catch (err) {
    await fsPromises.unlink(tempPath).catch(() => {});
    if (newDoc) {
      await Document.deleteOne({ _id: newDoc._id }).catch(() => {});
    }
    throw err;
  }
}

export async function getDocument(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }

  const document = await Document.findOne({ _id: id, ownerGuestId: req.guestId }).lean();
  if (!document) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }

  res.json({ document });
}

export async function getChunks(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }

  const document = await Document.findOne({ _id: id, ownerGuestId: req.guestId });
  if (!document) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }

  if (document.status !== 'ready') {
    throw new HttpError(409, 'DOCUMENT_NOT_READY', 'Document is still processing');
  }

  const chunks = await Chunk.find({ documentId: id }).sort({ order: 1 }).lean();
  res.json({ chunks });
}

export async function getFile(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }

  const document = await Document.findById(id);
  if (!document) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }

  if (document.ownerGuestId !== req.guestId && document.status !== 'ready') {
    throw new HttpError(403, 'FORBIDDEN', 'Access denied to this document');
  }

  const filePath = resolveStoragePath(document.storageKey);
  if (!fs.existsSync(filePath)) {
    throw new HttpError(404, 'FILE_NOT_FOUND', 'Document file is missing from storage');
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(document.originalName)}"`
  );
  fs.createReadStream(filePath).pipe(res);
}

export async function deleteDocument(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }

  const document = await Document.findOne({ _id: id, ownerGuestId: req.guestId });
  if (!document) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }

  await deleteDocumentCascade(document._id);
  res.json({ ok: true });
}

