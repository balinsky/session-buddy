const request = require('supertest');
const express = require('express');

jest.mock('../db/database');
const db = require('../db/database');

const app = express();
app.use(express.json());
app.use('/api/tunes', require('../routes/tunes'));

const VALID_USER = { id: 1, sync_code: 'test-code' };
const VALID_TUNE = {
  id: 10, user_id: 1, name: "Morrison's Jig", type: 'Jig', key: 'Edor',
  learning_status: 'Memorized', favorite: 0, count: 0,
  incipit_a: null, incipit_b: null, incipit_c: null,
};

// Authenticate successfully by default; individual tests can override
beforeEach(() => {
  db.getUserBySyncCode.mockResolvedValue(VALID_USER);
});

// ── Auth middleware ───────────────────────────────────────────────────────────

describe('auth middleware', () => {
  it('returns 401 when X-Sync-Code header is absent', async () => {
    const res = await request(app).get('/api/tunes');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/sync code required/i);
  });

  it('returns 401 when X-Sync-Code is not recognised', async () => {
    db.getUserBySyncCode.mockResolvedValue(null);
    const res = await request(app).get('/api/tunes').set('x-sync-code', 'bad-code');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid sync code/i);
  });
});

// ── GET /api/tunes ────────────────────────────────────────────────────────────

describe('GET /api/tunes', () => {
  it('returns all tunes for the authenticated user', async () => {
    db.getTunesByUser.mockResolvedValue([VALID_TUNE]);
    const res = await request(app).get('/api/tunes').set('x-sync-code', 'test-code');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([VALID_TUNE]);
  });

  it('returns an empty array when the user has no tunes', async () => {
    db.getTunesByUser.mockResolvedValue([]);
    const res = await request(app).get('/api/tunes').set('x-sync-code', 'test-code');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ── GET /api/tunes/:id ────────────────────────────────────────────────────────

describe('GET /api/tunes/:id', () => {
  it('returns the tune when found', async () => {
    db.getTuneById.mockResolvedValue(VALID_TUNE);
    const res = await request(app).get('/api/tunes/10').set('x-sync-code', 'test-code');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Morrison's Jig");
  });

  it('returns 404 when the tune does not exist', async () => {
    db.getTuneById.mockResolvedValue(null);
    const res = await request(app).get('/api/tunes/999').set('x-sync-code', 'test-code');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/tune not found/i);
  });
});

// ── POST /api/tunes ───────────────────────────────────────────────────────────

describe('POST /api/tunes', () => {
  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/tunes')
      .set('x-sync-code', 'test-code')
      .send({ type: 'Jig' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/i);
  });

  it('creates a tune and returns 201', async () => {
    db.createTune.mockResolvedValue(VALID_TUNE);
    const res = await request(app)
      .post('/api/tunes')
      .set('x-sync-code', 'test-code')
      .send({ name: "Morrison's Jig", type: 'Jig', key: 'Edor' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Morrison's Jig");
  });

  it('passes the full body to db.createTune', async () => {
    db.createTune.mockResolvedValue(VALID_TUNE);
    await request(app)
      .post('/api/tunes')
      .set('x-sync-code', 'test-code')
      .send({ name: "Morrison's Jig", type: 'Jig', key: 'Edor' });
    expect(db.createTune).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: "Morrison's Jig", type: 'Jig', key: 'Edor' })
    );
  });
});

// ── PUT /api/tunes/:id ────────────────────────────────────────────────────────

describe('PUT /api/tunes/:id', () => {
  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .put('/api/tunes/10')
      .set('x-sync-code', 'test-code')
      .send({ type: 'Jig' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the tune does not exist', async () => {
    db.updateTune.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/tunes/999')
      .set('x-sync-code', 'test-code')
      .send({ name: "Morrison's Jig" });
    expect(res.status).toBe(404);
  });

  it('returns the updated tune on success', async () => {
    const updated = { ...VALID_TUNE, key: 'D' };
    db.updateTune.mockResolvedValue(updated);
    const res = await request(app)
      .put('/api/tunes/10')
      .set('x-sync-code', 'test-code')
      .send({ name: "Morrison's Jig", key: 'D' });
    expect(res.status).toBe(200);
    expect(res.body.key).toBe('D');
  });
});

// ── PATCH /api/tunes/:id ──────────────────────────────────────────────────────

describe('PATCH /api/tunes/:id', () => {
  it('returns 404 when the tune does not exist', async () => {
    db.getTuneById.mockResolvedValue(null);
    const res = await request(app)
      .patch('/api/tunes/999')
      .set('x-sync-code', 'test-code')
      .send({ learning_status: 'Learning' });
    expect(res.status).toBe(404);
  });

  it('merges patch fields with the existing tune before saving', async () => {
    db.getTuneById.mockResolvedValue({ ...VALID_TUNE });
    db.updateTune.mockResolvedValue({ ...VALID_TUNE, learning_status: 'Learning' });
    const res = await request(app)
      .patch('/api/tunes/10')
      .set('x-sync-code', 'test-code')
      .send({ learning_status: 'Learning' });
    expect(res.status).toBe(200);
    // Both the unchanged name and the patched status should be in the db call
    expect(db.updateTune).toHaveBeenCalledWith(
      '10', 1,
      expect.objectContaining({ name: "Morrison's Jig", learning_status: 'Learning' })
    );
  });
});

// ── DELETE /api/tunes/:id ─────────────────────────────────────────────────────

describe('DELETE /api/tunes/:id', () => {
  it('returns 204 with no body', async () => {
    db.deleteTune.mockResolvedValue();
    const res = await request(app)
      .delete('/api/tunes/10')
      .set('x-sync-code', 'test-code');
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });
});

// ── POST /api/tunes/import ────────────────────────────────────────────────────

describe('POST /api/tunes/import', () => {
  const SYNC = 'test-code';

  it('returns 400 when no CSV file is attached', async () => {
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/csv file is required/i);
  });

  it('imports tunes and returns the count', async () => {
    const csv = "Name,Type,Key\nMorrison's Jig,Jig,Edor\nThe Kesh Jig,Jig,G";
    db.insertManyTunes.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
  });

  it('maps Learned=X to Memorized learning status', async () => {
    const csv = "Name,Learned\nMorrison's Jig,X";
    db.insertManyTunes.mockResolvedValue([{ id: 1 }]);
    await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(db.insertManyTunes).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ learning_status: 'Memorized' })])
    );
  });

  it('maps Learned column non-X value to Not Learned status', async () => {
    const csv = "Name,Learned\nMorrison's Jig,";
    db.insertManyTunes.mockResolvedValue([{ id: 1 }]);
    await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(db.insertManyTunes).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ learning_status: 'Not Learned' })])
    );
  });

  it('maps Favorite=X to favorite=1', async () => {
    const csv = "Name,Favorite\nMorrison's Jig,X";
    db.insertManyTunes.mockResolvedValue([{ id: 1 }]);
    await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(db.insertManyTunes).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ favorite: 1 })])
    );
  });

  it('handles case-insensitive column names', async () => {
    const csv = "name,type,key\nMorrison's Jig,Jig,Edor";
    db.insertManyTunes.mockResolvedValue([{ id: 1 }]);
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.status).toBe(200);
    expect(db.insertManyTunes).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ name: "Morrison's Jig", type: 'Jig' })])
    );
  });

  it('skips rows where Name is empty', async () => {
    const csv = "Name,Type\nMorrison's Jig,Jig\n,Reel";
    db.insertManyTunes.mockResolvedValue([{ id: 1 }]);
    await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    const [, tunes] = db.insertManyTunes.mock.calls[0];
    expect(tunes).toHaveLength(1);
    expect(tunes[0].name).toBe("Morrison's Jig");
  });

  it('returns 400 when every row has an empty Name', async () => {
    const csv = "Name,Type\n,Jig\n,Reel";
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no tunes imported/i);
  });

  it('returns imported=0 for a CSV with only a header row', async () => {
    const csv = "Name,Type,Key\n";
    db.insertManyTunes.mockResolvedValue([]);
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(0);
  });

  it('defaults count to 0 when Count column is empty', async () => {
    const csv = "Name,Count\nMorrison's Jig,";
    db.insertManyTunes.mockResolvedValue([{ id: 1 }]);
    await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(db.insertManyTunes).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ count: 0 })])
    );
  });

  it('returns 400 for a malformed CSV file', async () => {
    // A buffer that is not valid CSV (unterminated quote)
    const bad = Buffer.from('Name,Type\n"unterminated');
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', bad, 'bad.csv');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/could not parse csv/i);
  });
});
