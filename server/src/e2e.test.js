import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import path from 'node:path';
import app from './app.js';
import { connectDb } from './db/connect.js';
import { Document } from './models/Document.js';
import { Chunk } from './models/Chunk.js';
import { Generation } from './models/Generation.js';
import { deleteDocumentCascade } from './services/storage/index.js';

describe('End-to-End Ingestion and Generation Flow', () => {
  let docId = null;
  let genId = null;
  let guestCookie = null;

  beforeAll(async () => {
    await connectDb();
  });

  afterAll(async () => {
    if (docId) {
      await deleteDocumentCascade(docId).catch(() => {});
    }
    await mongoose.connection.close();
  });

  it('uploads PDF document and receives 202 accepted', async () => {
    const pdfPath = path.resolve('..', 'test_sample.pdf');
    const res = await request(app)
      .post('/api/documents')
      .attach('file', pdfPath);

    expect([200, 202]).toContain(res.status);
    expect(res.body.document).toBeDefined();
    docId = res.body.document._id;

    // Save cookie
    const cookies = res.headers['set-cookie'];
    if (cookies) {
      guestCookie = cookies.find((c) => c.startsWith('reai_guest='));
    }
  });

  it('polls document until status is ready', async () => {
    expect(docId).not.toBeNull();
    let ready = false;
    for (let i = 0; i < 20; i++) {
      const req = request(app).get(`/api/documents/${docId}`);
      if (guestCookie) req.set('Cookie', guestCookie);
      const res = await req;
      if (res.body.document.status === 'ready') {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    expect(ready).toBe(true);
  });

  it('fetches chunks with normalized bounding boxes', async () => {
    const req = request(app).get(`/api/documents/${docId}/chunks`);
    if (guestCookie) req.set('Cookie', guestCookie);
    const res = await req;

    expect(res.status).toBe(200);
    expect(res.body.chunks).toBeDefined();
    expect(res.body.chunks.length).toBeGreaterThan(0);

    const firstChunk = res.body.chunks[0];
    expect(firstChunk.chunkId).toMatch(/^c_1_[0-9]+$/);
    expect(firstChunk.bbox).toBeDefined();
    expect(firstChunk.bbox.x).toBeGreaterThanOrEqual(0);
    expect(firstChunk.bbox.y).toBeGreaterThanOrEqual(0);
    expect(firstChunk.bbox.w).toBeGreaterThan(0);
    expect(firstChunk.bbox.h).toBeGreaterThan(0);
  });

  it('creates generation and streams segments citing chunks', async () => {
    const req = request(app)
      .post('/api/generations')
      .send({
        documentId: docId,
        level: 'medium',
        goal: 'understanding',
      });
    if (guestCookie) req.set('Cookie', guestCookie);
    const res = await req;

    expect([200, 202]).toContain(res.status);
    genId = res.body.generation._id;
    expect(genId).toBeDefined();

    // Wait for generation runner to complete
    let done = false;
    for (let i = 0; i < 40; i++) {
      const getReq = request(app).get(`/api/generations/${genId}`);
      if (guestCookie) getReq.set('Cookie', guestCookie);
      const getRes = await getReq;
      if (getRes.body.generation.status === 'done') {
        done = true;
        expect(getRes.body.generation.segments.length).toBeGreaterThan(0);
        // Verify segments have source chunk IDs
        const seg = getRes.body.generation.segments[0];
        expect(seg.segmentId).toMatch(/^s_[0-9]+$/);
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(done).toBe(true);
  }, 45000);

  it('submits follow-up ask question and receives answers with citations', async () => {
    const req = request(app)
      .post(`/api/generations/${genId}/ask`)
      .send({
        question: 'What are neural networks inspired by?',
      });
    if (guestCookie) req.set('Cookie', guestCookie);
    const res = await req;

    expect(res.status).toBe(200);
    expect(res.body.followup).toBeDefined();
    expect(res.body.followup.kind).toBe('ask');
    expect(res.body.followup.answerSegments.length).toBeGreaterThan(0);
  }, 45000);
});

