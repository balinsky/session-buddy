const request = require('supertest');
const express = require('express');

jest.mock('../db/database');
const db = require('../db/database');

const app = express();
app.use(express.json());
app.use('/api/sets', require('../routes/sets'));

const VALID_USER = { id: 1, sync_code: 'test-code' };
const TUNE_A = { id: 10, name: "Morrison's Jig", type: 'Jig', key: 'Edor' };
const TUNE_B = { id: 11, name: 'The Kesh Jig', type: 'Jig', key: 'G' };
const VALID_SET = {
  id: 5, user_id: 1, favorite: 0, last_practiced_date: null,
  tunes: [TUNE_A, TUNE_B],
};

beforeEach(() => {
  db.getUserBySyncCode.mockResolvedValue(VALID_USER);
});

// ── GET /api/sets ─────────────────────────────────────────────────────────────

describe('GET /api/sets', () => {
  it('returns all sets for the authenticated user', async () => {
    db.getSetsByUser.mockResolvedValue([VALID_SET]);
    const res = await request(app).get('/api/sets').set('x-sync-code', 'test-code');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([VALID_SET]);
  });

  it('returns an empty array when the user has no sets', async () => {
    db.getSetsByUser.mockResolvedValue([]);
    const res = await request(app).get('/api/sets').set('x-sync-code', 'test-code');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ── GET /api/sets/:id ─────────────────────────────────────────────────────────

describe('GET /api/sets/:id', () => {
  it('returns the set with its tunes', async () => {
    db.getSetById.mockResolvedValue(VALID_SET);
    const res = await request(app).get('/api/sets/5').set('x-sync-code', 'test-code');
    expect(res.status).toBe(200);
    expect(res.body.tunes).toHaveLength(2);
  });

  it('returns 404 when the set does not exist', async () => {
    db.getSetById.mockResolvedValue(null);
    const res = await request(app).get('/api/sets/999').set('x-sync-code', 'test-code');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/set not found/i);
  });
});

// ── POST /api/sets ────────────────────────────────────────────────────────────

describe('POST /api/sets', () => {
  it('returns 400 when tuneIds is missing', async () => {
    const res = await request(app)
      .post('/api/sets')
      .set('x-sync-code', 'test-code')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when tuneIds is an empty array', async () => {
    const res = await request(app)
      .post('/api/sets')
      .set('x-sync-code', 'test-code')
      .send({ tuneIds: [] });
    expect(res.status).toBe(400);
  });

  it('creates a set and returns 201', async () => {
    db.createSet.mockResolvedValue(VALID_SET);
    const res = await request(app)
      .post('/api/sets')
      .set('x-sync-code', 'test-code')
      .send({ tuneIds: [10, 11] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(VALID_SET);
  });

  it('passes tuneIds and user id to db.createSet', async () => {
    db.createSet.mockResolvedValue(VALID_SET);
    await request(app)
      .post('/api/sets')
      .set('x-sync-code', 'test-code')
      .send({ tuneIds: [10, 11] });
    expect(db.createSet).toHaveBeenCalledWith(1, [10, 11]);
  });
});

// ── PUT /api/sets/:id ─────────────────────────────────────────────────────────

describe('PUT /api/sets/:id', () => {
  it('returns 400 when tuneIds is missing', async () => {
    const res = await request(app)
      .put('/api/sets/5')
      .set('x-sync-code', 'test-code')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when tuneIds is an empty array', async () => {
    const res = await request(app)
      .put('/api/sets/5')
      .set('x-sync-code', 'test-code')
      .send({ tuneIds: [] });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the set does not exist', async () => {
    db.updateSet.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/sets/999')
      .set('x-sync-code', 'test-code')
      .send({ tuneIds: [10] });
    expect(res.status).toBe(404);
  });

  it('returns the updated set', async () => {
    const updated = { ...VALID_SET, tunes: [TUNE_A] };
    db.updateSet.mockResolvedValue(updated);
    const res = await request(app)
      .put('/api/sets/5')
      .set('x-sync-code', 'test-code')
      .send({ tuneIds: [10] });
    expect(res.status).toBe(200);
    expect(res.body.tunes).toHaveLength(1);
  });
});

// ── PATCH /api/sets/:id ───────────────────────────────────────────────────────

describe('PATCH /api/sets/:id', () => {
  it('returns 404 when the set does not exist', async () => {
    db.patchSet.mockResolvedValue(null);
    const res = await request(app)
      .patch('/api/sets/999')
      .set('x-sync-code', 'test-code')
      .send({ favorite: 1 });
    expect(res.status).toBe(404);
  });

  it('patches the favorite field and returns the updated set', async () => {
    const favorited = { ...VALID_SET, favorite: 1 };
    db.patchSet.mockResolvedValue(favorited);
    const res = await request(app)
      .patch('/api/sets/5')
      .set('x-sync-code', 'test-code')
      .send({ favorite: 1 });
    expect(res.status).toBe(200);
    expect(res.body.favorite).toBe(1);
  });

  it('patches the last_practiced_date field', async () => {
    const patched = { ...VALID_SET, last_practiced_date: '2026-04-24' };
    db.patchSet.mockResolvedValue(patched);
    const res = await request(app)
      .patch('/api/sets/5')
      .set('x-sync-code', 'test-code')
      .send({ last_practiced_date: '2026-04-24' });
    expect(res.status).toBe(200);
    expect(res.body.last_practiced_date).toBe('2026-04-24');
  });
});

// ── POST /api/sets/:id/practice ───────────────────────────────────────────────

describe('POST /api/sets/:id/practice', () => {
  it('returns 400 when date is missing', async () => {
    const res = await request(app)
      .post('/api/sets/5/practice')
      .set('x-sync-code', 'test-code')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date is required/i);
  });

  it('returns 404 when the set does not exist', async () => {
    db.practiceSet.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/sets/999/practice')
      .set('x-sync-code', 'test-code')
      .send({ date: '2026-04-24' });
    expect(res.status).toBe(404);
  });

  it('returns the set with the updated practiced date', async () => {
    const practiced = { ...VALID_SET, last_practiced_date: '2026-04-24' };
    db.practiceSet.mockResolvedValue(practiced);
    const res = await request(app)
      .post('/api/sets/5/practice')
      .set('x-sync-code', 'test-code')
      .send({ date: '2026-04-24' });
    expect(res.status).toBe(200);
    expect(res.body.last_practiced_date).toBe('2026-04-24');
  });

  it('passes the set id, user id, and date to db.practiceSet', async () => {
    db.practiceSet.mockResolvedValue({ ...VALID_SET, last_practiced_date: '2026-04-24' });
    await request(app)
      .post('/api/sets/5/practice')
      .set('x-sync-code', 'test-code')
      .send({ date: '2026-04-24' });
    expect(db.practiceSet).toHaveBeenCalledWith('5', 1, '2026-04-24');
  });
});

// ── DELETE /api/sets/:id ──────────────────────────────────────────────────────

describe('DELETE /api/sets/:id', () => {
  it('returns 204 with no body', async () => {
    db.deleteSet.mockResolvedValue();
    const res = await request(app)
      .delete('/api/sets/5')
      .set('x-sync-code', 'test-code');
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });
});
