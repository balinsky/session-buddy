const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { Readable } = require('stream');
const tar = require('tar');
const { parse } = require('csv-parse/sync');
const db = require('../db/database');

const upload = multer({ storage: multer.memoryStorage() });
const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadTarball = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Extracts image files from a tar or tar.gz buffer
async function extractTarEntries(buffer) {
  const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  const files = [];
  const entryPromises = [];
  await new Promise((resolve, reject) => {
    const parser = new tar.Parse({ gzip: isGzip });
    parser.on('entry', entry => {
      if (entry.type !== 'File') { entry.resume(); return; }
      const ext = path.extname(entry.path).toLowerCase();
      const mimeType = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
                     : ext === '.png' ? 'image/png' : null;
      if (!mimeType) { entry.resume(); return; }
      const chunks = [];
      const p = new Promise(res => {
        entry.on('data', c => chunks.push(c));
        entry.on('end', () => {
          files.push({ filename: path.basename(entry.path), buffer: Buffer.concat(chunks), mimeType });
          res();
        });
      });
      entryPromises.push(p);
    });
    parser.on('finish', resolve);
    parser.on('error', reject);
    Readable.from(buffer).pipe(parser);
  });
  await Promise.all(entryPromises);
  return files;
}

async function requireUser(req, res, next) {
  try {
    // Accept sync code from header (API calls) or query param (image src URLs)
    const syncCode = req.headers['x-sync-code'] || req.query.code;
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

router.post('/:id/merge', async (req, res) => {
  try {
    const primaryId = Number(req.params.id);
    const { mergeIds } = req.body;
    if (!Array.isArray(mergeIds) || mergeIds.length === 0) {
      return res.status(400).json({ error: 'mergeIds array is required.' });
    }
    const result = await db.mergeTunes(primaryId, mergeIds.map(Number), req.user.id);
    if (!result) return res.status(404).json({ error: 'One or more tunes not found.' });
    res.json(result);
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
    const parts = ['Could not parse CSV: ' + err.message];
    if (err.code) parts.push(`error code: ${err.code}`);
    if (err.lines) parts.push(`line: ${err.lines}`);
    if (err.field !== undefined) parts.push(`field: ${err.field}`);
    return res.status(400).json({ error: parts.join(' — ') });
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

  // Fetch existing tunes to detect duplicates
  let existingTunes;
  try {
    existingTunes = await db.getTunesByUser(req.user.id);
  } catch (err) {
    return res.status(500).json({ error: 'Could not load existing tunes: ' + err.message });
  }

  const existingNames = new Set(existingTunes.map(t => (t.name || '').toLowerCase().trim()).filter(Boolean));
  const existingSessionIds = new Set(existingTunes.map(t => (t.thesession_id || '').trim()).filter(Boolean));

  const toImport = [];
  const errorRows = [];

  for (const tune of tunes) {
    const name = (tune.name || '').toLowerCase().trim();
    const sid = (tune.thesession_id || '').trim();
    const reasons = [];

    if (name && existingNames.has(name)) reasons.push(`name "${tune.name}" already exists`);
    if (sid && existingSessionIds.has(sid)) reasons.push(`Thesession ID ${sid} already exists`);

    if (reasons.length > 0) {
      errorRows.push({
        Name: tune.name,
        Type: tune.type || '',
        Key: tune.key || '',
        'Thesession ID': tune.thesession_id || '',
        Errors: reasons.join('; '),
      });
    } else {
      toImport.push(tune);
      if (name) existingNames.add(name);
      if (sid) existingSessionIds.add(sid);
    }
  }

  try {
    const imported = toImport.length > 0 ? await db.insertManyTunes(req.user.id, toImport) : [];
    res.json({
      imported: imported.length,
      duplicates: errorRows.length,
      errorRows,
      createdIds: imported.map(t => t.id),
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error during import: ' + err.message });
  }
});

// --- Image routes ---

router.get('/:id/image', async (req, res) => {
  try {
    const image = await db.getTuneImageData(req.params.id, req.user.id);
    if (!image) return res.status(404).send('No image.');
    res.set('Content-Type', image.mime_type);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(image.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/image', uploadImage.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image file required.' });
    const { mimetype, originalname, buffer } = req.file;
    if (!['image/jpeg', 'image/png'].includes(mimetype)) {
      return res.status(400).json({ error: 'Only JPEG and PNG images are supported.' });
    }
    const tune = await db.getTuneById(req.params.id, req.user.id);
    if (!tune) return res.status(404).json({ error: 'Tune not found.' });
    await db.setTuneImage(tune.id, req.user.id, originalname, mimetype, buffer);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/image', async (req, res) => {
  try {
    await db.deleteTuneImage(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import-images', uploadTarball.single('tarball'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Tarball file required.' });

    const allTunes = await db.getTunesByUser(req.user.id);
    const sidToTune = {};
    for (const tune of allTunes) {
      if (tune.thesession_id) sidToTune[tune.thesession_id.trim()] = tune;
    }

    let files;
    try {
      files = await extractTarEntries(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: 'Could not parse archive: ' + err.message });
    }

    let imported = 0;
    const unmatched = [];

    for (const { filename, buffer, mimeType } of files) {
      // Extract all digit sequences from the filename and check against known Thesession IDs
      const basename = path.basename(filename, path.extname(filename));
      const digitRuns = basename.match(/\d+/g) || [];
      const matchedTune = digitRuns.map(d => sidToTune[d]).find(Boolean);

      if (!matchedTune) { unmatched.push(filename); continue; }

      await db.setTuneImage(matchedTune.id, req.user.id, filename, mimeType, buffer);
      imported++;
    }

    res.json({ imported, unmatched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
