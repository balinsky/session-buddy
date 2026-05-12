const request = require('supertest');
const express = require('express');

jest.mock('../db/database');
const db = require('../db/database');

const app = express();
app.use(express.json());
app.use('/api', require('../routes/classes'));
app.use('/api/musicians', require('../routes/musicians'));

const VALID_USER = { id: 1, sync_code: 'test-code' };
const SYNC = 'test-code';

beforeEach(() => {
  db.getUserBySyncCode.mockResolvedValue(VALID_USER);
  db.findOrCreateSeriesByName.mockResolvedValue({ id: 5, name: 'Test Series' });
  db.findOrCreateMusicianByName.mockResolvedValue({ id: 10, name: 'Kevin Crawford' });
  db.getClassesWithDetails.mockResolvedValue([]);
  db.getClassesByUser.mockResolvedValue([]);
  db.getTunesByUser.mockResolvedValue([]);
  db.createClass.mockResolvedValue({ id: 99, name: 'New Class', series: null, instructors: [], tunes: [] });
});

// ── Auth middleware (smoke) ──────────────────────────────────────────────────

describe('classes auth', () => {
  it('returns 401 without sync code', async () => {
    const res = await request(app).get('/api/classes');
    expect(res.status).toBe(401);
  });
});

// ── /api/classes ─────────────────────────────────────────────────────────────

describe('GET /api/classes', () => {
  it('returns the user\'s classes', async () => {
    db.getClassesByUser.mockResolvedValue([
      { id: 1, name: 'OAIM Whistle Class 3', series: null, instructors: [] },
    ]);
    const res = await request(app).get('/api/classes').set('x-sync-code', SYNC);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('OAIM Whistle Class 3');
  });
});

describe('GET /api/classes/:id', () => {
  it('returns the class detail with tunes and instructors', async () => {
    db.getClassById.mockResolvedValue({
      id: 1, name: 'OAIM Whistle Class 3',
      series: { id: 5, name: 'OAIM Spring 2025 Whistle' },
      instructors: [{ id: 10, name: 'Kevin Crawford' }],
      tunes: [{ id: 100, name: 'The Kesh' }],
    });
    const res = await request(app).get('/api/classes/1').set('x-sync-code', SYNC);
    expect(res.status).toBe(200);
    expect(res.body.series.name).toBe('OAIM Spring 2025 Whistle');
    expect(res.body.instructors[0].name).toBe('Kevin Crawford');
    expect(res.body.tunes[0].name).toBe('The Kesh');
  });

  it('returns 404 when the class does not exist', async () => {
    db.getClassById.mockResolvedValue(null);
    const res = await request(app).get('/api/classes/999').set('x-sync-code', SYNC);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/classes', () => {
  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/classes')
      .set('x-sync-code', SYNC)
      .send({ organizer: 'OAIM' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/i);
  });

  it('creates a class and returns 201', async () => {
    const created = { id: 10, name: 'Class 3', series: null, instructors: [], tunes: [] };
    db.createClass.mockResolvedValue(created);
    const res = await request(app).post('/api/classes')
      .set('x-sync-code', SYNC)
      .send({ name: 'Class 3', series_id: 5, organizer: 'OAIM',
              tune_ids: [100, 200], instructor_ids: [10] });
    expect(res.status).toBe(201);
    expect(db.createClass).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: 'Class 3', series_id: 5, tune_ids: [100, 200], instructor_ids: [10] })
    );
  });
});

describe('PUT /api/classes/:id', () => {
  it('returns 404 when the class does not exist', async () => {
    db.updateClass.mockResolvedValue(null);
    const res = await request(app).put('/api/classes/999')
      .set('x-sync-code', SYNC)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(404);
  });

  it('returns the updated class on success', async () => {
    db.updateClass.mockResolvedValue({ id: 10, name: 'Renamed', series: null, instructors: [], tunes: [] });
    const res = await request(app).put('/api/classes/10')
      .set('x-sync-code', SYNC)
      .send({ name: 'Renamed', tune_ids: [100] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
  });
});

describe('DELETE /api/classes/:id', () => {
  it('returns 204', async () => {
    const res = await request(app).delete('/api/classes/10').set('x-sync-code', SYNC);
    expect(res.status).toBe(204);
    expect(db.deleteClass).toHaveBeenCalledWith('10', 1);
  });
});

// ── /api/class-series ────────────────────────────────────────────────────────

describe('GET /api/class-series', () => {
  it('returns the user\'s series', async () => {
    db.getClassSeriesByUser.mockResolvedValue([
      { id: 5, name: 'OAIM Spring 2025 Whistle', organizer: 'OAIM' },
    ]);
    const res = await request(app).get('/api/class-series').set('x-sync-code', SYNC);
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('OAIM Spring 2025 Whistle');
  });
});

describe('POST /api/class-series', () => {
  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/class-series')
      .set('x-sync-code', SYNC)
      .send({ organizer: 'OAIM' });
    expect(res.status).toBe(400);
  });

  it('creates a series and returns 201', async () => {
    db.createClassSeries.mockResolvedValue({ id: 5, name: 'Spring 2025' });
    const res = await request(app).post('/api/class-series')
      .set('x-sync-code', SYNC)
      .send({ name: 'Spring 2025', organizer: 'OAIM' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Spring 2025');
  });
});

describe('PUT /api/class-series/:id', () => {
  it('returns 404 when not found', async () => {
    db.updateClassSeries.mockResolvedValue(null);
    const res = await request(app).put('/api/class-series/999')
      .set('x-sync-code', SYNC).send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

// ── /api/musicians ───────────────────────────────────────────────────────────

describe('GET /api/musicians', () => {
  it('returns the user\'s musicians', async () => {
    db.getMusiciansByUser.mockResolvedValue([
      { id: 10, name: 'Kevin Crawford', instruments: 'Flute, Whistle' },
    ]);
    const res = await request(app).get('/api/musicians').set('x-sync-code', SYNC);
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Kevin Crawford');
  });
});

describe('GET /api/musicians/:id', () => {
  it('returns the musician with their classes', async () => {
    db.getMusicianById.mockResolvedValue({
      id: 10, name: 'Kevin Crawford',
      classes: [{ id: 1, name: 'OAIM Whistle Class 3' }, { id: 2, name: 'Retreat 2024' }],
    });
    const res = await request(app).get('/api/musicians/10').set('x-sync-code', SYNC);
    expect(res.status).toBe(200);
    expect(res.body.classes).toHaveLength(2);
  });

  it('returns 404 when not found', async () => {
    db.getMusicianById.mockResolvedValue(null);
    const res = await request(app).get('/api/musicians/999').set('x-sync-code', SYNC);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/musicians', () => {
  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/musicians')
      .set('x-sync-code', SYNC).send({ instruments: 'Flute' });
    expect(res.status).toBe(400);
  });

  it('creates a musician and returns 201', async () => {
    db.createMusician.mockResolvedValue({ id: 10, name: 'Kevin Crawford' });
    const res = await request(app).post('/api/musicians')
      .set('x-sync-code', SYNC)
      .send({ name: 'Kevin Crawford', instruments: 'Flute, Whistle' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Kevin Crawford');
  });
});

describe('DELETE /api/musicians/:id', () => {
  it('returns 204', async () => {
    const res = await request(app).delete('/api/musicians/10').set('x-sync-code', SYNC);
    expect(res.status).toBe(204);
  });
});

// ── GET /api/classes/export ──────────────────────────────────────────────────

describe('GET /api/classes/export', () => {
  it('returns a CSV with the correct headers', async () => {
    db.getClassesWithDetails.mockResolvedValue([]);
    const res = await request(app).get('/api/classes/export').set('x-sync-code', SYNC);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const firstLine = res.text.split('\r\n')[0];
    expect(firstLine).toBe('Name,Series,Organizer,Instrument,Date,Notes,Instructors,Tune Names,Tune IDs');
  });

  it('serialises a class with instructors and tunes into one CSV row', async () => {
    db.getClassesWithDetails.mockResolvedValue([{
      id: 1,
      name: 'Class 3',
      organizer: 'OAIM',
      instrument: 'High D Whistle',
      date: '2025-03-15',
      notes: '',
      series: { id: 5, name: 'OAIM Spring 2025 Whistle' },
      instructors: [{ id: 10, name: 'Kevin Crawford' }, { id: 11, name: 'Nuala Kennedy' }],
      tunes: [
        { id: 100, name: "Morrison's Jig", thesession_id: '1' },
        { id: 200, name: 'The Kesh Jig', thesession_id: '38' },
      ],
    }]);
    const res = await request(app).get('/api/classes/export').set('x-sync-code', SYNC);
    const lines = res.text.split('\r\n');
    expect(lines).toHaveLength(2);  // header + 1 data row
    const dataLine = lines[1];
    expect(dataLine).toContain('Class 3');
    expect(dataLine).toContain('OAIM Spring 2025 Whistle');
    expect(dataLine).toContain('Kevin Crawford; Nuala Kennedy');
    expect(dataLine).toContain("Morrison's Jig; The Kesh Jig");
    expect(dataLine).toContain('1; 38');
  });
});

// ── POST /api/classes/import ─────────────────────────────────────────────────

describe('POST /api/classes/import', () => {
  it('returns 400 when no CSV is attached', async () => {
    const res = await request(app).post('/api/classes/import').set('x-sync-code', SYNC);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/csv file is required/i);
  });

  it('imports a new class and returns imported=1', async () => {
    const csv = 'Name,Series,Organizer\nClass 3,OAIM Spring 2025,OAIM';
    const res = await request(app).post('/api/classes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'classes.csv');
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toBe(0);
    expect(db.findOrCreateSeriesByName).toHaveBeenCalledWith(1, 'OAIM Spring 2025');
    expect(db.createClass).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Class 3', organizer: 'OAIM' }));
  });

  it('skips a class that already exists (same name + series)', async () => {
    db.getClassesByUser.mockResolvedValue([
      { id: 7, name: 'Class 3', series_id: 5 },
    ]);
    db.findOrCreateSeriesByName.mockResolvedValue({ id: 5, name: 'OAIM Spring 2025' });
    const csv = 'Name,Series\nClass 3,OAIM Spring 2025';
    const res = await request(app).post('/api/classes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'classes.csv');
    expect(res.body.imported).toBe(0);
    expect(res.body.skipped).toBe(1);
    expect(res.body.errorRows[0].Error).toMatch(/already exists/i);
    expect(db.createClass).not.toHaveBeenCalled();
  });

  it('matches tunes by Thesession ID and passes their IDs to createClass', async () => {
    db.getTunesByUser.mockResolvedValue([
      { id: 100, name: "Morrison's Jig", thesession_id: '1', class_ids: [] },
    ]);
    const csv = "Name,Tune Names,Tune IDs\nClass 3,Morrison's Jig,1";
    const res = await request(app).post('/api/classes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'classes.csv');
    expect(res.body.imported).toBe(1);
    expect(db.createClass).toHaveBeenCalledWith(1, expect.objectContaining({ tune_ids: [100] }));
  });

  it('falls back to name match when Tune ID column is blank', async () => {
    db.getTunesByUser.mockResolvedValue([
      { id: 200, name: 'The Kesh Jig', thesession_id: '', class_ids: [] },
    ]);
    const csv = 'Name,Tune Names,Tune IDs\nClass 3,The Kesh Jig,';
    const res = await request(app).post('/api/classes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'classes.csv');
    expect(res.body.imported).toBe(1);
    expect(db.createClass).toHaveBeenCalledWith(1, expect.objectContaining({ tune_ids: [200] }));
  });

  it('adds an error row for unmatched tunes but still imports the class', async () => {
    db.getTunesByUser.mockResolvedValue([]);
    const csv = 'Name,Tune Names,Tune IDs\nClass 3,Unknown Tune,9999';
    const res = await request(app).post('/api/classes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'classes.csv');
    expect(res.body.imported).toBe(1);
    expect(res.body.errorRows).toHaveLength(1);
    expect(res.body.errorRows[0].Error).toMatch(/not found/i);
    expect(db.createClass).toHaveBeenCalledWith(1, expect.objectContaining({ tune_ids: [] }));
  });

  it('find-or-creates musicians for the Instructors column', async () => {
    db.findOrCreateMusicianByName.mockImplementation((uid, name) =>
      Promise.resolve({ id: name === 'Kevin Crawford' ? 10 : 11, name })
    );
    const csv = 'Name,Instructors\nClass 3,Kevin Crawford; Nuala Kennedy';
    const res = await request(app).post('/api/classes/import')
      .set('x-sync-code', SYNC)
      .attach('csv', Buffer.from(csv), 'classes.csv');
    expect(res.body.imported).toBe(1);
    expect(db.findOrCreateMusicianByName).toHaveBeenCalledWith(1, 'Kevin Crawford');
    expect(db.findOrCreateMusicianByName).toHaveBeenCalledWith(1, 'Nuala Kennedy');
    expect(db.createClass).toHaveBeenCalledWith(1, expect.objectContaining({ instructor_ids: [10, 11] }));
  });
});
