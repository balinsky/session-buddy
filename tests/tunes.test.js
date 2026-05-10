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

// Authenticate successfully by default; individual tests can override.
// findTuneDup defaults to "no duplicate" so POST/PUT tests don't accidentally
// hit the 409 path from a leftover mock implementation in a prior test.
beforeEach(() => {
  db.getUserBySyncCode.mockResolvedValue(VALID_USER);
  db.findTuneDup.mockResolvedValue(null);
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

  it('returns 409 with conflictingTuneId when findTuneDup reports a duplicate', async () => {
    db.findTuneDup.mockResolvedValue({ id: 42, reason: 'name "Morrison\'s Jig"' });
    const res = await request(app)
      .post('/api/tunes')
      .set('x-sync-code', 'test-code')
      .send({ name: "Morrison's Jig", type: 'Jig' });
    expect(res.status).toBe(409);
    expect(res.body.conflictingTuneId).toBe(42);
    expect(res.body.error).toMatch(/already exists/i);
    expect(db.createTune).not.toHaveBeenCalled();
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

  it('returns 409 when editing a tune to match another tune\'s identity', async () => {
    db.findTuneDup.mockResolvedValue({ id: 99, reason: 'Thesession ID 63' });
    const res = await request(app)
      .put('/api/tunes/10')
      .set('x-sync-code', 'test-code')
      .send({ name: 'Renamed Tune', thesession_id: '63' });
    expect(res.status).toBe(409);
    expect(res.body.conflictingTuneId).toBe(99);
    // Confirm the dup-check excluded the tune being edited (id 10).
    expect(db.findTuneDup).toHaveBeenCalledWith(1, expect.any(Object), 10);
    expect(db.updateTune).not.toHaveBeenCalled();
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

  it('does NOT flag a name match as a duplicate when types disagree', async () => {
    // The user's collection has a Reel "Last Night's Fun" (SID 63). Importing
    // the Slip Jig version (SID 5909) should succeed — different tune.
    db.getTunesByUser.mockResolvedValue([
      { id: 100, name: "Last Night's Fun", type: 'Reel', thesession_id: '63' },
    ]);
    const csv = "Name,Type,Thesession ID\nLast Night's Fun,Slip Jig,5909";
    db.insertManyTunes.mockResolvedValue([{ id: 200 }]);
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.duplicates).toBe(0);
  });

  it('still flags a name match when types agree', async () => {
    db.getTunesByUser.mockResolvedValue([
      { id: 100, name: "Morrison's Jig", type: 'Jig', thesession_id: '' },
    ]);
    const csv = "Name,Type\nMorrison's Jig,Jig";
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.body.imported).toBe(0);
    expect(res.body.duplicates).toBe(1);
    expect(res.body.errorRows[0].Errors).toMatch(/already exists/i);
  });

  it('flags a Thesession ID match regardless of name', async () => {
    db.getTunesByUser.mockResolvedValue([
      { id: 100, name: "Old Name", type: 'Reel', thesession_id: '63' },
    ]);
    const csv = "Name,Type,Thesession ID\nNew Name,Reel,63";
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.body.imported).toBe(0);
    expect(res.body.duplicates).toBe(1);
    expect(res.body.errorRows[0].Errors).toMatch(/Thesession ID 63/);
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

  it('does NOT flag a name match as a duplicate when types disagree', async () => {
    // The user's collection has a Reel called "Last Night's Fun" (SID 63).
    // Importing the Slip Jig version (SID 5909) should succeed — different tune.
    db.getTunesByUser.mockResolvedValue([
      { id: 100, name: "Last Night's Fun", type: 'Reel', thesession_id: '63' },
    ]);
    const csv = "Name,Type,Thesession ID\nLast Night's Fun,Slip Jig,5909";
    db.insertManyTunes.mockResolvedValue([{ id: 200 }]);
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.duplicates).toBe(0);
  });

  it('still flags a name match when types agree (or one type is missing)', async () => {
    db.getTunesByUser.mockResolvedValue([
      { id: 100, name: "Morrison's Jig", type: 'Jig', thesession_id: '' },
    ]);
    const csv = "Name,Type\nMorrison's Jig,Jig";
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.body.imported).toBe(0);
    expect(res.body.duplicates).toBe(1);
    expect(res.body.errorRows[0].Errors).toMatch(/already exists/i);
  });

  it('flags a Thesession ID match regardless of name', async () => {
    db.getTunesByUser.mockResolvedValue([
      { id: 100, name: "Old Name", type: 'Reel', thesession_id: '63' },
    ]);
    const csv = "Name,Type,Thesession ID\nNew Name,Reel,63";
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.body.imported).toBe(0);
    expect(res.body.duplicates).toBe(1);
    expect(res.body.errorRows[0].Errors).toMatch(/Thesession ID 63/);
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

  // ── Phase 5: per-instrument CSV columns ──────────────────────────────────

  it('uses per-instrument columns when present and bulk-inserts statuses', async () => {
    const csv =
      'Name,Learned (D Flute),Learned (Concertina)\n' +
      "Morrison's Jig,X,L\n" +
      'The Kesh Jig,L,';
    db.insertManyTunes.mockResolvedValue([{ id: 11 }, { id: 22 }]);
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.status).toBe(200);
    expect(res.body.perInstrumentMode).toBe(true);
    // Comma-joined instrument list reflects SUPPORTED_INSTRUMENTS iteration
    // order (Concertina before D Flute), not CSV column order.
    expect(db.insertManyTunes).toHaveBeenCalledWith(1, expect.arrayContaining([
      expect.objectContaining({ name: "Morrison's Jig", instrument: 'Concertina, D Flute', learning_status: 'Memorized' }),
      expect.objectContaining({ name: 'The Kesh Jig', instrument: 'D Flute', learning_status: 'Learning' }),
    ]));
    expect(db.bulkInsertTuneInstrumentStatuses).toHaveBeenCalledWith([
      { tune_id: 11, instrument: 'Concertina', status: 'Learning' },
      { tune_id: 11, instrument: 'D Flute', status: 'Memorized' },
      { tune_id: 22, instrument: 'D Flute', status: 'Learning' },
    ]);
    expect(db.syncTuneInstrumentRows).not.toHaveBeenCalled();
  });

  it('treats blank cells in per-instrument columns as not tracked', async () => {
    const csv =
      'Name,Learned (D Flute),Learned (Concertina)\n' +
      'Lonesome Tune,,\n';
    db.insertManyTunes.mockResolvedValue([{ id: 33 }]);
    await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(db.insertManyTunes).toHaveBeenCalledWith(1, expect.arrayContaining([
      expect.objectContaining({ name: 'Lonesome Tune', instrument: '', learning_status: 'Not Learned' }),
    ]));
    // No per-instrument rows should be inserted for the blank-only row.
    expect(db.bulkInsertTuneInstrumentStatuses).not.toHaveBeenCalled();
  });

  it('combines per-instrument cells with the Instrument column for instruments without their own cell', async () => {
    // Concertina has a per-instrument column; Fiddle doesn't but is in Instrument.
    const csv =
      'Name,Instrument,Learned (Concertina)\n' +
      "Morrison's Jig,Fiddle,X\n";
    db.insertManyTunes.mockResolvedValue([{ id: 44 }]);
    await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(db.bulkInsertTuneInstrumentStatuses).toHaveBeenCalledWith([
      { tune_id: 44, instrument: 'Concertina', status: 'Memorized' },
      { tune_id: 44, instrument: 'Fiddle', status: 'Not Learned' },
    ]);
  });

  it('falls back to legacy Learned column when no per-instrument columns are present', async () => {
    const csv = "Name,Instrument,Learned\nMorrison's Jig,D Flute,X";
    db.insertManyTunes.mockResolvedValue([{ id: 55 }]);
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.body.perInstrumentMode).toBe(false);
    expect(db.insertManyTunes).toHaveBeenCalledWith(1, expect.arrayContaining([
      expect.objectContaining({ learning_status: 'Memorized', instrument: 'D Flute' }),
    ]));
    // Legacy path uses syncTuneInstrumentRows with the resolved learning_status
    // as the default for newly-created per-instrument rows.
    expect(db.syncTuneInstrumentRows).toHaveBeenCalledWith(55, 1, 'D Flute', 'Memorized');
    expect(db.bulkInsertTuneInstrumentStatuses).not.toHaveBeenCalled();
  });

  it('per-instrument column header lookup is case-insensitive', async () => {
    const csv = 'Name,LEARNED (D Flute)\nMorrison\'s Jig,X';
    db.insertManyTunes.mockResolvedValue([{ id: 66 }]);
    const res = await request(app)
      .post('/api/tunes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'tunes.csv');
    expect(res.body.perInstrumentMode).toBe(true);
    expect(db.bulkInsertTuneInstrumentStatuses).toHaveBeenCalled();
  });
});

// ── Image serving ─────────────────────────────────────────────────────────────

describe('GET /api/tunes/:id/image/:imageId', () => {
  const SYNC = 'test-code';
  const IMAGE = {
    filename: 'a.png',
    mime_type: 'image/png',
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    created_at: new Date('2026-04-01T12:00:00Z'),
  };

  it('serves the image with ETag, Last-Modified, and immutable cache headers', async () => {
    db.getTuneImageData.mockResolvedValue(IMAGE);
    const res = await request(app)
      .get('/api/tunes/10/image/42')
      .set('x-sync-code', SYNC);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['etag']).toBe('"img-42"');
    expect(res.headers['last-modified']).toBe(IMAGE.created_at.toUTCString());
    expect(res.headers['cache-control']).toMatch(/immutable/);
    expect(res.body).toEqual(IMAGE.data);
  });

  it('returns 304 when the client sends a matching If-None-Match', async () => {
    db.getTuneImageData.mockResolvedValue(IMAGE);
    const res = await request(app)
      .get('/api/tunes/10/image/42')
      .set('x-sync-code', SYNC)
      .set('If-None-Match', '"img-42"');
    expect(res.status).toBe(304);
    expect(res.headers['etag']).toBe('"img-42"');
  });
});

// ── POST /api/tunes/:id/merge ─────────────────────────────────────────────────

describe('POST /api/tunes/:id/merge', () => {
  const SYNC = 'test-code';

  it('returns 400 when mergeIds is missing', async () => {
    const res = await request(app)
      .post('/api/tunes/1/merge')
      .set('x-sync-code', SYNC)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mergeids/i);
  });

  it('returns 400 when mergeIds is an empty array', async () => {
    const res = await request(app)
      .post('/api/tunes/1/merge')
      .set('x-sync-code', SYNC)
      .send({ mergeIds: [] });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the db indicates one or more tunes are not owned', async () => {
    db.mergeTunes.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/tunes/1/merge')
      .set('x-sync-code', SYNC)
      .send({ mergeIds: [2, 3] });
    expect(res.status).toBe(404);
  });

  it('coerces id strings to numbers and returns the merged tune', async () => {
    db.mergeTunes.mockResolvedValue({ ...VALID_TUNE, count: 7 });
    const res = await request(app)
      .post('/api/tunes/1/merge')
      .set('x-sync-code', SYNC)
      .send({ mergeIds: ['2', '3'] });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(7);
    expect(db.mergeTunes).toHaveBeenCalledWith(1, [2, 3], 1);
  });
});

// ── POST /api/tunes/import-images (tarball) ───────────────────────────────────

// Builds a uncompressed USTAR tarball in memory for testing the import route.
// Hand-rolled rather than disk-backed to keep tests hermetic and fast.
function buildTarball(files) {
  const parts = [];
  for (const { name, content } of files) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write('0000644\0', 100, 8);             // mode
    header.write('0000000\0', 108, 8);             // uid
    header.write('0000000\0', 116, 8);             // gid
    header.write(buf.length.toString(8).padStart(11, '0') + '\0', 124, 12); // size
    header.write('00000000000\0', 136, 12);        // mtime
    header.write('        ', 148, 8);              // checksum field filled with spaces for the sum
    header.write('0', 156, 1);                     // typeflag: regular file
    header.write('ustar\0', 257, 6);               // magic
    header.write('00', 263, 2);                    // version
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    parts.push(header, buf);
    const padLen = (512 - (buf.length % 512)) % 512;
    if (padLen > 0) parts.push(Buffer.alloc(padLen));
  }
  parts.push(Buffer.alloc(1024)); // two zero blocks signal end-of-archive
  return Buffer.concat(parts);
}

describe('POST /api/tunes/import-images', () => {
  const SYNC = 'test-code';
  const TUNES_WITH_SIDS = [
    { id: 11, thesession_id: '12345', user_id: 1, name: 'Tune A' },
    { id: 22, thesession_id: '67890', user_id: 1, name: 'Tune B' },
  ];

  beforeEach(() => {
    db.getTunesByUser.mockResolvedValue(TUNES_WITH_SIDS);
    db.addTuneImage.mockResolvedValue({ id: 99 });
  });

  it('returns 400 when no tarball file is attached', async () => {
    const res = await request(app)
      .post('/api/tunes/import-images')
      .set('x-sync-code', SYNC);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tarball file required/i);
  });

  it('matches files to tunes by digit-runs in the filename', async () => {
    const buf = buildTarball([
      { name: 'sheet-12345.png', content: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      { name: 'whistle-67890.jpg', content: Buffer.from([0xff, 0xd8, 0xff]) },
    ]);
    const res = await request(app)
      .post('/api/tunes/import-images')
      .set('x-sync-code', SYNC)
      .attach('tarball', buf, 'archive.tar');
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.unmatched).toEqual([]);
    expect(db.addTuneImage).toHaveBeenCalledTimes(2);
    expect(db.addTuneImage).toHaveBeenCalledWith(11, 1, 'sheet-12345.png', 'image/png', expect.any(Buffer));
    expect(db.addTuneImage).toHaveBeenCalledWith(22, 1, 'whistle-67890.jpg', 'image/jpeg', expect.any(Buffer));
  });

  it('reports unmatched filenames whose digit-runs do not match any tune', async () => {
    const buf = buildTarball([
      { name: 'sheet-99999.png', content: Buffer.from([0x89]) },
    ]);
    const res = await request(app)
      .post('/api/tunes/import-images')
      .set('x-sync-code', SYNC)
      .attach('tarball', buf, 'archive.tar');
    expect(res.body.imported).toBe(0);
    expect(res.body.unmatched).toEqual(['sheet-99999.png']);
    expect(db.addTuneImage).not.toHaveBeenCalled();
  });

  it('silently skips entries whose extension is not jpg/png/pdf', async () => {
    const buf = buildTarball([
      { name: 'note-12345.txt', content: Buffer.from('hi') },
    ]);
    const res = await request(app)
      .post('/api/tunes/import-images')
      .set('x-sync-code', SYNC)
      .attach('tarball', buf, 'archive.tar');
    // Non-image entries are filtered out before matching, so they're not
    // reported as unmatched either — they simply don't exist as far as
    // import-images is concerned.
    expect(res.body.imported).toBe(0);
    expect(res.body.unmatched).toEqual([]);
    expect(db.addTuneImage).not.toHaveBeenCalled();
  });

  it('detects gzipped tarballs via magic bytes and decompresses transparently', async () => {
    const zlib = require('zlib');
    const rawTar = buildTarball([
      { name: 'sheet-12345.png', content: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    ]);
    const gzipped = zlib.gzipSync(rawTar);
    expect(gzipped[0]).toBe(0x1f);
    expect(gzipped[1]).toBe(0x8b);
    const res = await request(app)
      .post('/api/tunes/import-images')
      .set('x-sync-code', SYNC)
      .attach('tarball', gzipped, 'archive.tar.gz');
    expect(res.body.imported).toBe(1);
    expect(db.addTuneImage).toHaveBeenCalledWith(11, 1, 'sheet-12345.png', 'image/png', expect.any(Buffer));
  });

  it('classifies pdf attachments correctly', async () => {
    const buf = buildTarball([
      { name: 'score-12345.pdf', content: Buffer.from('%PDF-1.4\n') },
    ]);
    const res = await request(app)
      .post('/api/tunes/import-images')
      .set('x-sync-code', SYNC)
      .attach('tarball', buf, 'archive.tar');
    expect(res.body.imported).toBe(1);
    expect(db.addTuneImage).toHaveBeenCalledWith(11, 1, 'score-12345.pdf', 'application/pdf', expect.any(Buffer));
  });
});

// ── Per-instrument status routes ─────────────────────────────────────────────

describe('GET /api/tunes/:id/instruments', () => {
  const SYNC = 'test-code';

  it('returns the per-instrument statuses for the tune', async () => {
    db.getTuneById.mockResolvedValue(VALID_TUNE);
    db.getTuneInstrumentStatuses.mockResolvedValue([
      { instrument: 'D Flute', status: 'Memorized' },
      { instrument: 'Concertina', status: 'Learning' },
    ]);
    const res = await request(app)
      .get('/api/tunes/10/instruments')
      .set('x-sync-code', SYNC);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { instrument: 'D Flute', status: 'Memorized' },
      { instrument: 'Concertina', status: 'Learning' },
    ]);
  });

  it('returns 404 when the tune does not exist', async () => {
    db.getTuneById.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/tunes/999/instruments')
      .set('x-sync-code', SYNC);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/tunes/:id/instruments/:instrument', () => {
  const SYNC = 'test-code';

  it('upserts the status for the given instrument', async () => {
    db.setTuneInstrumentStatus.mockResolvedValue([
      { instrument: 'D Flute', status: 'Memorized' },
    ]);
    const res = await request(app)
      .put('/api/tunes/10/instruments/D%20Flute')
      .set('x-sync-code', SYNC)
      .send({ status: 'Memorized' });
    expect(res.status).toBe(200);
    expect(db.setTuneInstrumentStatus).toHaveBeenCalledWith('10', 1, 'D Flute', 'Memorized');
  });

  it('returns 400 for an invalid status', async () => {
    const res = await request(app)
      .put('/api/tunes/10/instruments/D%20Flute')
      .set('x-sync-code', SYNC)
      .send({ status: 'Inverted' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status must be one of/i);
    expect(db.setTuneInstrumentStatus).not.toHaveBeenCalled();
  });

  it('returns 404 when the tune is not owned by the user', async () => {
    db.setTuneInstrumentStatus.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/tunes/10/instruments/Fiddle')
      .set('x-sync-code', SYNC)
      .send({ status: 'Learning' });
    expect(res.status).toBe(404);
  });

  it('defaults status to Not Learned when omitted from the body', async () => {
    db.setTuneInstrumentStatus.mockResolvedValue([]);
    await request(app)
      .put('/api/tunes/10/instruments/Fiddle')
      .set('x-sync-code', SYNC)
      .send({});
    expect(db.setTuneInstrumentStatus).toHaveBeenCalledWith('10', 1, 'Fiddle', 'Not Learned');
  });
});

describe('DELETE /api/tunes/:id/instruments/:instrument', () => {
  const SYNC = 'test-code';

  it('deletes the per-instrument row and returns the remaining list', async () => {
    db.deleteTuneInstrumentStatus.mockResolvedValue([]);
    const res = await request(app)
      .delete('/api/tunes/10/instruments/D%20Flute')
      .set('x-sync-code', SYNC);
    expect(res.status).toBe(200);
    expect(db.deleteTuneInstrumentStatus).toHaveBeenCalledWith('10', 1, 'D Flute');
  });

  it('returns 404 when the tune is not owned by the user', async () => {
    db.deleteTuneInstrumentStatus.mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/tunes/10/instruments/Fiddle')
      .set('x-sync-code', SYNC);
    expect(res.status).toBe(404);
  });
});

describe('Tune save: per-instrument sync', () => {
  const SYNC = 'test-code';

  it('POST /api/tunes calls syncTuneInstrumentRows with the new tune\'s instrument list', async () => {
    db.createTune.mockResolvedValue({ ...VALID_TUNE, instrument: 'D Flute, Concertina' });
    await request(app)
      .post('/api/tunes')
      .set('x-sync-code', SYNC)
      .send({ name: VALID_TUNE.name, instrument: 'D Flute, Concertina' });
    // The 4th arg is the form's learning_status (used as default for new
    // per-instrument rows). Undefined when the body doesn't include it.
    expect(db.syncTuneInstrumentRows).toHaveBeenCalledWith(VALID_TUNE.id, 1, 'D Flute, Concertina', undefined);
  });

  it('PUT /api/tunes/:id calls syncTuneInstrumentRows after the update', async () => {
    db.updateTune.mockResolvedValue({ ...VALID_TUNE, instrument: 'Fiddle' });
    await request(app)
      .put('/api/tunes/10')
      .set('x-sync-code', SYNC)
      .send({ name: VALID_TUNE.name, instrument: 'Fiddle', learning_status: 'Learning' });
    expect(db.syncTuneInstrumentRows).toHaveBeenCalledWith(VALID_TUNE.id, 1, 'Fiddle', 'Learning');
  });

  it('PATCH /api/tunes/:id only syncs when the body includes an instrument field', async () => {
    db.getTuneById.mockResolvedValue(VALID_TUNE);
    db.updateTune.mockResolvedValue(VALID_TUNE);
    await request(app).patch('/api/tunes/10').set('x-sync-code', SYNC).send({ favorite: 1 });
    expect(db.syncTuneInstrumentRows).not.toHaveBeenCalled();
    await request(app).patch('/api/tunes/10').set('x-sync-code', SYNC).send({ instrument: 'Fiddle' });
    expect(db.syncTuneInstrumentRows).toHaveBeenCalled();
  });

  it('POST /api/tunes calls syncTuneClasses when class_ids is in the body', async () => {
    db.createTune.mockResolvedValue(VALID_TUNE);
    await request(app)
      .post('/api/tunes')
      .set('x-sync-code', SYNC)
      .send({ name: VALID_TUNE.name, class_ids: [3, 5] });
    expect(db.syncTuneClasses).toHaveBeenCalledWith(VALID_TUNE.id, 1, [3, 5]);
  });

  it('POST /api/tunes does NOT call syncTuneClasses when class_ids is omitted', async () => {
    db.createTune.mockResolvedValue(VALID_TUNE);
    await request(app)
      .post('/api/tunes')
      .set('x-sync-code', SYNC)
      .send({ name: VALID_TUNE.name });
    expect(db.syncTuneClasses).not.toHaveBeenCalled();
  });

  it('PUT /api/tunes/:id calls syncTuneClasses with the body\'s class_ids', async () => {
    db.updateTune.mockResolvedValue(VALID_TUNE);
    await request(app)
      .put('/api/tunes/10')
      .set('x-sync-code', SYNC)
      .send({ name: VALID_TUNE.name, class_ids: [7] });
    expect(db.syncTuneClasses).toHaveBeenCalledWith(VALID_TUNE.id, 1, [7]);
  });
});
