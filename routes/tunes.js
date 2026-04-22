const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db/database');

const upload = multer({ storage: multer.memoryStorage() });

async function requireUser(req, res, next) {
  try {
    const syncCode = req.headers['x-sync-code'];
    if (!syncCode) return res.status(401).json({ error: 'Sync code required.' });
    const user = await db.getUserBySyncCode(syncCode);
    if (!user) return res.status(401).json({ error: 'Invalid sync code.' });
    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.use(requireUser);

router.get('/', async (req, res) => {
  try {
    res.json(await db.getTunesByUser(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const tune = await db.getTuneById(req.params.id, req.user.id);
    if (!tune) return res.status(404).json({ error: 'Tune not found.' });
    res.json(tune);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Tune name is required.' });
    const tune = await db.createTune(req.user.id, req.body);
    res.status(201).json(tune);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Tune name is required.' });
    const tune = await db.updateTune(req.params.id, req.user.id, req.body);
    if (!tune) return res.status(404).json({ error: 'Tune not found.' });
    res.json(tune);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await db.getTuneById(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Tune not found.' });
    const tune = await db.updateTune(req.params.id, req.user.id, { ...existing, ...req.body });
    res.json(tune);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.deleteTune(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', upload.single('csv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file is required.' });

  let records;
  try {
    records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    return res.status(400).json({ error: 'Could not parse CSV: ' + err.message });
  }

  // Case-insensitive column lookup
  function col(row, name) {
    if (row[name] !== undefined) return row[name] || '';
    const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? (row[key] || '') : '';
  }

  const tunes = records
    .map(row => {
      const learnedCol = col(row, 'Learned');
      const isMemorized = learnedCol.toUpperCase() === 'X';

      return {
        name: col(row, 'Name'),
        type: col(row, 'Type'),
        key: col(row, 'Key'),
        parts: col(row, 'Parts'),
        incipit_a: col(row, 'Incipit A'),
        incipit_b: col(row, 'Incipit B'),
        incipit_c: col(row, 'Incipit C'),
        learning_status: isMemorized ? 'Memorized' : 'Not Learned',
        count: parseInt(col(row, 'Count')) || 0,
        added_date: col(row, 'Added'),
        where_learned: col(row, 'Where'),
        who: col(row, 'Who'),
        mnemonic: col(row, 'Mnemonic'),
        tunebooks: col(row, 'Tunebooks'),
        date_learned: col(row, 'Date Learned'),
        favorite: col(row, 'Favorite').toUpperCase() === 'X' ? 1 : 0,
        thesession_id: col(row, 'Thesession ID'),
        setting: col(row, 'Setting'),
        notes: col(row, 'Notes'),
        composer: col(row, 'Composer'),
        last_practiced_date: col(row, 'Last Practiced Date'),
        instrument: col(row, 'Instrument'),
        sequence_id: col(row, 'Sequence ID'),
      };
    })
    .filter(t => t.name.length > 0);

  if (records.length > 0 && tunes.length === 0) {
    const foundColumns = Object.keys(records[0]).join(', ');
    return res.status(400).json({
      error: `No tunes imported. The CSV has ${records.length} rows but none have a value in the Name column. Columns found: ${foundColumns}`
    });
  }

  try {
    const imported = await db.insertManyTunes(req.user.id, tunes);
    res.json({ imported: imported.length });
  } catch (err) {
    res.status(500).json({ error: 'Database error during import: ' + err.message });
  }
});

module.exports = router;
