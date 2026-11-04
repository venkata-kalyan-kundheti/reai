import mongoose from 'mongoose';
import { Generation } from '../models/Generation.js';
import { HttpError } from '../utils/httpError.js';
import { askFollowupSchema, simplifyFollowupSchema } from '../schemas/api.js';
import { askQuestion } from '../services/generation/ask.js';
import { simplifySegment } from '../services/generation/simplify.js';

export async function handleAsk(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');
  }

  const gen = await Generation.findOne({ _id: id, ownerGuestId: req.guestId });
  if (!gen) {
    throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');
  }

  const body = askFollowupSchema.parse(req.body);
  const followup = await askQuestion({
    generationId: gen._id,
    question: body.question,
    selectionText: body.selectionText,
    selectionRect: body.selectionRect,
    anchorSegmentId: body.anchorSegmentId,
  });

  res.json({ followup });
}

export async function handleSimplify(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');
  }

  const gen = await Generation.findOne({ _id: id, ownerGuestId: req.guestId });
  if (!gen) {
    throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');
  }

  const body = simplifyFollowupSchema.parse(req.body);
  const followup = await simplifySegment({
    generationId: gen._id,
    segmentId: body.segmentId,
  });

  res.json({ followup });
}

