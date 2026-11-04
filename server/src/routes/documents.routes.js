import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uploadSingle } from '../middleware/upload.js';
import {
  createDocument,
  getDocument,
  getChunks,
  getFile,
  deleteDocument,
} from '../controllers/documents.controller.js';

const router = Router();

router.post('/', uploadSingle, asyncHandler(createDocument));
router.get('/:id', asyncHandler(getDocument));
router.get('/:id/chunks', asyncHandler(getChunks));
router.get('/:id/file', asyncHandler(getFile));
router.delete('/:id', asyncHandler(deleteDocument));

export default router;

