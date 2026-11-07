import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { Generation } from './Generation.js';
import { Chunk } from './Chunk.js';
import { Document } from './Document.js';
import { prepareSegment } from '../services/generation/validateSegments.js';
import { regionToChunk, normalizeRegions } from '../services/vision/regions.js';
import { followupSegmentId } from '../utils/ids.js';

const oid = () => new mongoose.Types.ObjectId();

describe('Mongoose schemas accept what the new code writes', () => {
  const chunkMap = new Map([['c_1_0', { chunkId: 'c_1_0', text: 'alpha beta gamma delta' }]]);

  it('Generation with progress, usage, resumable error and sectioned segments', () => {
    const seg = prepareSegment({ type: 'paragraph', depth: 1, text: 'alpha beta gamma', sources: ['c_1_0'] }, 0, chunkMap, { section: 2 });
    const f = prepareSegment({ type: 'paragraph', depth: 1, text: 'alpha', sources: ['c_1_0'] }, 0, chunkMap, { idFn: (n) => followupSegmentId('f_ab', n) });
    expect(f.segmentId).toBe('fs_f_ab_0'); // cannot collide with s_0

    const g = new Generation({
      documentId: oid(), ownerGuestId: 'g', cacheKey: 'medium:understanding:q:fig', status: 'failed',
      errorCode: 'RATE_LIMITED', errorRetryable: true, retryAfterSec: 20,
      progress: { sectionIndex: 2, sectionCount: 5 }, usage: { calls: 3, tokens: 1234 },
      segments: [seg],
      followups: [{ followupId: 'f_ab', kind: 'ask', question: 'q', answerSegments: [f] }],
    });
    expect(g.validateSync()).toBeUndefined();
    expect(g.segments[0].section).toBe(2);
  });

  it('image_region Chunk with fractional order and region fields', () => {
    const [r] = normalizeRegions([{ label: 'Validate Input', role: 'node', seq: 1, box_2d: [100, 100, 200, 300] }], 1);
    const doc = regionToChunk(r, { documentId: oid(), page: 1, order: 4.001 });
    const c = new Chunk(doc);
    expect(c.validateSync()).toBeUndefined();
    expect(c.regionSeq).toBe(1);
  });

  it('Document vision fields', () => {
    const d = new Document({
      ownerGuestId: 'g', originalName: 'a.pdf', sizeBytes: 1, storageKey: 'k', fileHash: 'h', expiresAt: new Date(),
      visionStatus: 'running', visionProgress: { done: 1, total: 3 }, regionCount: 4,
    });
    expect(d.validateSync()).toBeUndefined();
    expect(new Document({ ...d.toObject(), visionStatus: 'bogus' }).validateSync()).toBeDefined();
  });
});

describe('server wiring', () => {
  it('the express app (all routes, controllers, services) loads', async () => {
    const app = (await import('../app.js')).default;
    expect(typeof app).toBe('function');
  });
});
