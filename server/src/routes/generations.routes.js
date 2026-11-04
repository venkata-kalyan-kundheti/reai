import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createGeneration,
  getGeneration,
  streamGeneration,
} from '../controllers/generations.controller.js';
import { handleAsk, handleSimplify } from '../controllers/ask.controller.js';

const router = Router();

router.post('/', asyncHandler(createGeneration));
router.get('/:id', asyncHandler(getGeneration));
router.get('/:id/stream', asyncHandler(streamGeneration));
router.post('/:id/ask', asyncHandler(handleAsk));
router.post('/:id/simplify', asyncHandler(handleSimplify));

export default router;

