import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './app.js';

describe('App routes and middleware', () => {
  it('GET /api/health returns 200 ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('sets signed reai_guest cookie on request', async () => {
    const res = await request(app).get('/api/health');
    // Note: /api/health is before guestAuth, so request to an authenticated endpoint
    const resAuth = await request(app).get('/api/documents/invalid-id');
    expect(resAuth.status).toBe(404);
    const cookies = resAuth.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith('reai_guest='))).toBe(true);
  });

  it('returns 404 for unknown route in standard error format', async () => {
    const res = await request(app).get('/api/unknown-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

