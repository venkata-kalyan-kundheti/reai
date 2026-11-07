import mongoose from 'mongoose';
import { rectSchema } from './Chunk.js';

const segmentSchema = new mongoose.Schema(
  {
    segmentId: { type: String, required: true },
    order: { type: Number, required: true },
    type: {
      type: String,
      enum: ['heading', 'paragraph', 'bullet', 'step'],
      required: true,
    },
    depth: { type: Number, min: 1, max: 3, default: 1 },
    text: { type: String, required: true, maxlength: 4000 },
    sources: [{ type: String }],
    confidence: { type: String, enum: ['high', 'low'], default: 'high' },
    section: { type: Number }, // which document section produced it (used to resume after a failure)
  },
  { _id: false }
);

const followupSchema = new mongoose.Schema(
  {
    followupId: { type: String, required: true },
    kind: { type: String, enum: ['ask', 'simplify'], required: true },
    anchorSegmentId: { type: String, default: null },
    selectionText: { type: String, default: null },
    selectionRect: {
      type: {
        page: { type: Number },
        rect: rectSchema,
      },
      default: null,
    },
    question: { type: String, required: true },
    answerSegments: [segmentSchema],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const generationSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    ownerGuestId: { type: String, required: true },
    level: { type: String, enum: ['beginner', 'medium', 'experienced'], default: 'medium' },
    goal: { type: String, enum: ['exam', 'presentation', 'understanding'], default: 'understanding' },
    question: { type: String, default: 'Explain this document', maxlength: 2000 },
    cacheKey: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'streaming', 'done', 'failed'],
      default: 'pending',
      index: true,
    },
    segments: [segmentSchema],
    followups: [followupSchema],
    provider: { type: String },
    model: { type: String },
    errorCode: { type: String },
    errorMessage: { type: String },
    errorRetryable: { type: Boolean, default: true },
    retryAfterSec: { type: Number },
    progress: {
      sectionIndex: { type: Number, default: 0 }, // next section to write (== sections finished)
      sectionCount: { type: Number, default: 0 },
    },
    usage: {
      calls: { type: Number, default: 0 },
      tokens: { type: Number, default: 0 },
    },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

generationSchema.index({ documentId: 1, cacheKey: 1 }, { unique: true });

export const Generation = mongoose.model('Generation', generationSchema);

