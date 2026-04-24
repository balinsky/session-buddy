const request = require('supertest');
const express = require('express');

jest.mock('../db/database');
const db = require('../db/database');

const app = express();
app.use(express.json());
app.use('/api/sync', require('../routes/sync'));

// The sync code format: adjective-noun-2digitnumber
const SYNC_CODE_PATTERN = /^[a-z]+-[a-z]+-\d{2}$/;

describe('POST /api/sync/new', () => {
  beforeEach(() => {
    db.getUserBySyncCode.mockResolvedValue(null);
    // Echo the generated code back so we can inspect it
    db.createUser.mockImplementation(code => Promise.resolve({ sync_code: code }));
  });

  it('responds 200 with a syncCode property', async () => {
    const res = await request(app).post('/api/sync/new');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('syncCode');
  });

  it('generates a sync code in adjective-noun-number format', async () => {
    const res = await request(app).post('/api/sync/new');
    expect(res.body.syncCode).toMatch(SYNC_CODE_PATTERN);
  });

  it('retries when the first generated code is already taken', async () => {
    db.getUserBySyncCode
      .mockResolvedValueOnce({ id: 1 }) // first attempt: collision
      .mockResolvedValue(null);          // second attempt: unique
    const res = await request(app).post('/api/sync/new');
    expect(res.status).toBe(200);
    expect(db.getUserBySyncCode.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('POST /api/sync/join', () => {
  it('returns the sync code when the code is valid', async () => {
    db.getUserBySyncCode.mockResolvedValue({ sync_code: 'bold-hill-77' });
    const res = await request(app).post('/api/sync/join').send({ syncCode: 'bold-hill-77' });
    expect(res.status).toBe(200);
    expect(res.body.syncCode).toBe('bold-hill-77');
  });

  it('returns 400 when no syncCode field is in the request body', async () => {
    const res = await request(app).post('/api/sync/join').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sync code required/i);
  });

  it('returns 404 when the sync code does not exist', async () => {
    db.getUserBySyncCode.mockResolvedValue(null);
    const res = await request(app).post('/api/sync/join').send({ syncCode: 'ghost-peak-99' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('trims and lowercases the sync code before looking it up', async () => {
    db.getUserBySyncCode.mockResolvedValue({ sync_code: 'bold-hill-77' });
    await request(app).post('/api/sync/join').send({ syncCode: '  BOLD-HILL-77  ' });
    expect(db.getUserBySyncCode).toHaveBeenCalledWith('bold-hill-77');
  });
});
