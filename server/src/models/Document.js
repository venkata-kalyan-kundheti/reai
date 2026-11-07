import mongoose from 'mongoose';

const pageSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    rotation: { type: Number, default: 0 },
    charCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    ownerGuestId: { type: String, required: true, index: true },
    originalName: { type: String, required: true, maxlength: 200 },
    mimeType: { type: String, default: 'application/pdf' },
    sizeBytes: { type: Number, required: true },
    storageKey: { type: String, required: true },
    fileHash: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['uploaded', 'parsing', 'ready', 'failed'],
      default: 'uploaded',
      index: true,
    },
    errorCode: { type: String },
    errorMessage: { type: String },
    pageCount: { type: Number, default: 0 },
    pages: [pageSchema],
    totalChars: { type: Number, default: 0 },
    // Phase 5: diagram / figure analysis runs in the background AFTER the document is ready
    visionStatus: {
      type: String,
      enum: ['none', 'pending', 'running', 'done', 'skipped', 'failed'],
      default: 'none',
    },
    visionProgress: {
      done: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    visionNote: { type: String },
    regionCount: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export const Document = mongoose.model('Document', documentSchema);

