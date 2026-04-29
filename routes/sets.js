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
    res.json(await db.getSetsByUser(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const set = await db.getSetById(req.params.id, req.user.id);
    if (!set) return res.status(404).json({ error: 'Set not found.' });
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { tuneIds } = req.body;
    if (!Array.isArray(tuneIds) || tuneIds.length < 1) {
      return res.status(400).json({ error: 'At least one tune is required.' });
    }
    const set = await db.createSet(req.user.id, tuneIds);
    res.status(201).json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', upload.single('csv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file is required.' });

  let records;
  try {
    records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch (err) {
    const parts = ['Could not parse CSV: ' + err.message];
    if (err.code) parts.push(`error code: ${err.code}`);
    if (err.lines) parts.push(`line: ${err.lines}`);
    if (err.field !== undefined) parts.push(`field: ${err.field}`);
    return res.status(400).json({ error: parts.join(' — ') });
  }

  // Case-insensitive column lookup
  function col(row, name) {
    if (row[name] !== undefined) return (row[name] || '').trim();
    const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? (row[key] || '').trim() : '';
  }

  // Index user's tunes by thesession_id for fast lookup
  let allTunes;
  try {
    allTunes = await db.getTunesByUser(req.user.id);
  } catch (err) {
    return res.status(500).json({ error: 'Could not load tunes: ' + err.message });
  }

  const bySessionId = {};
  for (const tune of allTunes) {
    if (tune.thesession_id) {
      const key = String(tune.thesession_id).trim();
      if (!bySessionId[key]) bySessionId[key] = [];
      bySessionId[key].push(tune);
    }
  }

  function parseRef(ref) {
    const [idPart, settingRaw] = ref.split('#');
    const id = idPart.trim();
    // Accept both "setting2" and bare "2" after the #
    const setting = settingRaw ? settingRaw.trim().replace(/^setting/i, '') : null;
    return { id, setting };
  }

  function findTune(ref) {
    const { id, setting } = parseRef(ref);
    const candidates = bySessionId[id] || [];
    if (candidates.length === 0) return null;
    if (setting) return candidates.find(t => String(t.setting || '').trim() === setting) || null;
    return candidates[0];
  }

  let imported = 0;
  const errorRows = [];

  for (const row of records) {
    const refs = [];
    for (let i = 1; i <= 5; i++) {
      const val = col(row, `Tune ${i}`);
      if (val) refs.push({ field: `Tune ${i}`, ref: val });
    }
    if (refs.length === 0) continue;

    const tuneIds = [];
    const errors = [];

    for (const { field, ref } of refs) {
      const tune = findTune(ref);
      if (tune) {
        tuneIds.push(tune.id);
      } else {
        const { id: refId, setting: refSetting } = parseRef(ref);
        let msg = `${field} (${ref}) not found — add this tune with Thesession ID ${refId}`;
        if (refSetting) msg += `, Setting ${refSetting}`;
        errors.push(msg);
      }
    }

    if (errors.length > 0) {
      errorRows.push({
        'Tune 1': col(row, 'Tune 1'),
        'Tune 2': col(row, 'Tune 2'),
        'Tune 3': col(row, 'Tune 3'),
        'Tune 4': col(row, 'Tune 4'),
        'Tune 5': col(row, 'Tune 5'),
        'Errors': errors.join('; '),
      });
    } else {
      try {
        await db.createSet(req.user.id, tuneIds);
        imported++;
      } catch (err) {
        errorRows.push({
          'Tune 1': col(row, 'Tune 1'),
          'Tune 2': col(row, 'Tune 2'),
          'Tune 3': col(row, 'Tune 3'),
          'Tune 4': col(row, 'Tune 4'),
          'Tune 5': col(row, 'Tune 5'),
          'Errors': 'Database error: ' + err.message,
        });
      }
    }
  }

  res.json({ imported, errorRows });
});

router.put('/:id', async (req, res) => {
  try {
    const { tuneIds } = req.body;
    if (!Array.isArray(tuneIds) || tuneIds.length < 1) {
      return res.status(400).json({ error: 'At least one tune is required.' });
    }
    const set = await db.updateSet(req.params.id, req.user.id, tuneIds);
    if (!set) return res.status(404).json({ error: 'Set not found.' });
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const set = await db.patchSet(req.params.id, req.user.id, req.body);
    if (!set) return res.status(404).json({ error: 'Set not found.' });
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/practice', async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'Date is required.' });
    const set = await db.practiceSet(req.params.id, req.user.id, date);
    if (!set) return res.status(404).json({ error: 'Set not found.' });
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.deleteSet(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
