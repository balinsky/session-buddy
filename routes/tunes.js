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

  const tunes = records
    .map(row => {
      const learnedCol = row['Learned'] || row['learned'] || row['LEARNED'] || '';
      const isMemorized = learnedCol.toUpperCase() === 'X';
      const dateLearned = row['Date Learned'] || '';

      return {
        name: row['Name'] || '',
        type: row['Type'] || '',
        key: row['Key'] || '',
        parts: row['Parts'] || '',
        incipit_a: row['Incipit A'] || '',
        incipit_b: row['Incipit B'] || '',
        incipit_c: row['Incipit C'] || '',
        learning_status: isMemorized ? 'Memorized' : 'Not Learned',
        count: parseInt(row['Count']) || 0,
        added_date: row['Added'] || '',
        where_learned: row['Where'] || '',
        who: row['Who'] || '',
        mnemonic: row['Mnemonic'] || '',
        tunebooks: row['Tunebooks'] || '',
        date_learned: dateLearned,
        favorite: (row['Favorite'] || '').toUpperCase() === 'X' ? 1 : 0,
        thesession_id: row['Thesession ID'] || '',
        setting: row['Setting'] || '',
        notes: row['Notes'] || '',
        composer: row['Composer'] || '',
        last_practiced_date: row['Last Practiced Date'] || '',
      };
    })
    .filter(t => t.name.length > 0);

  try {
    const imported = await db.insertManyTunes(req.user.id, tunes);
    res.json({ imported: imported.length });
  } catch (err) {
    res.status(500).json({ error: 'Database error during import: ' + err.message });
  }
});

module.exports = router;
