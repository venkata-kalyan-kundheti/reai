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
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export const Document = mongoose.model('Document', documentSchema);

