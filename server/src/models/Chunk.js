import mongoose from 'mongoose';

export const rectSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
    w: { type: Number, required: true, min: 0, max: 1 },
    h: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const chunkSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    chunkId: { type: String, required: true },
    page: { type: Number, required: true },
    order: { type: Number, required: true },
    type: {
      type: String,
      enum: ['heading', 'paragraph', 'list_item', 'caption', 'image_region'],
      required: true,
    },
    text: { type: String, required: true },
    rects: [rectSchema],
    bbox: { type: rectSchema, required: true },
    fontSize: { type: Number, default: 10 },
    column: { type: Number, default: 0 },
  },
  { timestamps: false }
);

chunkSchema.index({ documentId: 1, chunkId: 1 }, { unique: true });
chunkSchema.index({ documentId: 1, order: 1 });

export const Chunk = mongoose.model('Chunk', chunkSchema);

