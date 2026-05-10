const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { Readable } = require('stream');
const tar = require('tar');
const { parse } = require('csv-parse/sync');
const db = require('../db/database');
const requireUser = require('../middleware/requireUser');

const upload = multer({ storage: multer.memoryStorage() });
const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadTarball = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Extracts image files from a tar or tar.gz buffer
async function extractTarEntries(buffer) {
  const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  const files = [];
  const entryPromises = [];
  await new Promise((resolve, reject) => {
    const parser = new tar.Parser({ gzip: isGzip });
    parser.on('entry', entry => {
      if (entry.type !== 'File') { entry.resume(); return; }
      const ext = path.extname(entry.path).toLowerCase();
      const mimeType = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
                     : ext === '.png' ? 'image/png'
                     : ext === '.pdf' ? 'application/pdf' : null;
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
    const dup = await db.findTuneDup(req.user.id, {
      name: req.body.name,
      type: req.body.type,
      sid: req.body.thesession_id,
    });
    if (dup) {
      return res.status(409).json({
        error: `A tune with this ${dup.reason} already exists.`,
        conflictingTuneId: dup.id,
      });
    }
    const tune = await db.createTune(req.user.id, req.body);
    // The form's instrument list and learning_status are no longer columns;
    // pass them straight through to the per-instrument sync. Newly-checked
    // instruments adopt learning_status as their starting status.
    await db.syncTuneInstrumentRows(tune.id, req.user.id, req.body.instrument, req.body.learning_status);
    if (Array.isArray(req.body.class_ids)) {
      await db.syncTuneClasses(tune.id, req.user.id, req.body.class_ids);
    }
    res.status(201).json(tune);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Tune name is required.' });
    const dup = await db.findTuneDup(req.user.id, {
      name: req.body.name,
      type: req.body.type,
      sid: req.body.thesession_id,
    }, parseInt(req.params.id));
    if (dup) {
      return res.status(409).json({
        error: `A different tune with this ${dup.reason} already exists.`,
        conflictingTuneId: dup.id,
      });
    }
    const tune = await db.updateTune(req.params.id, req.user.id, req.body);
    if (!tune) return res.status(404).json({ error: 'Tune not found.' });
    await db.syncTuneInstrumentRows(tune.id, req.user.id, req.body.instrument, req.body.learning_status);
    if (Array.isArray(req.body.class_ids)) {
      await db.syncTuneClasses(tune.id, req.user.id, req.body.class_ids);
    }
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
    if (req.body.instrument !== undefined) {
      await db.syncTuneInstrumentRows(tune.id, req.user.id, req.body.instrument, req.body.learning_status);
    }
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

  // Detect per-instrument columns (Phase 5). Returns Map<instrument, headerName>.
  // The presence of any such column makes per-instrument data authoritative;
  // the legacy `Learned` column is then ignored for status resolution.
  const SUPPORTED_INSTRUMENTS = ['Bb Whistle', 'C Whistle', 'Concertina', 'D Flute', 'Fiddle', 'High D Whistle', 'Low F Whistle'];
  const perInstrumentHeaders = new Map();
  if (records.length > 0) {
    const headerKeys = Object.keys(records[0]);
    for (const inst of SUPPORTED_INSTRUMENTS) {
      const target = `learned (${inst})`.toLowerCase();
      const match = headerKeys.find(h => h.toLowerCase() === target);
      if (match) perInstrumentHeaders.set(inst, match);
    }
  }
  const usePerInstrument = perInstrumentHeaders.size > 0;

  function parsePerInstrumentCells(row, instrumentColumnList) {
    // Returns Map<instrument, status>. Blank cells in per-instrument columns
    // mean "not tracked" (no row); the Instrument column then fills in any
    // instruments NOT covered by a per-instrument column, defaulting to Not Learned.
    const tracked = new Map();
    for (const [inst, header] of perInstrumentHeaders) {
      const cell = (row[header] || '').trim().toUpperCase();
      if (cell === '') continue;
      const status = cell === 'X' ? 'Memorized' : cell === 'L' ? 'Learning' : 'Not Learned';
      tracked.set(inst, status);
    }
    const coveredByColumn = new Set(perInstrumentHeaders.keys());
    for (const inst of instrumentColumnList) {
      if (coveredByColumn.has(inst)) continue;
      if (tracked.has(inst)) continue;
      tracked.set(inst, 'Not Learned');
    }
    return tracked;
  }

  const STATUS_RANK = { 'Memorized': 2, 'Learning': 1, 'Not Learned': 0 };
  function bestOf(map) {
    let best = 'Not Learned';
    for (const status of map.values()) {
      if ((STATUS_RANK[status] ?? 0) > (STATUS_RANK[best] ?? 0)) best = status;
    }
    return best;
  }

  const tunes = records
    .map(row => {
      const instrumentColumn = col(row, 'Instrument');
      const instrumentColumnList = instrumentColumn.split(',').map(s => s.trim()).filter(Boolean);

      let learning_status, instrument, _instrumentStatuses;
      if (usePerInstrument) {
        _instrumentStatuses = parsePerInstrumentCells(row, instrumentColumnList);
        instrument = Array.from(_instrumentStatuses.keys()).join(', ');
        learning_status = _instrumentStatuses.size > 0 ? bestOf(_instrumentStatuses) : 'Not Learned';
      } else {
        const learnedCol = col(row, 'Learned');
        learning_status = learnedCol.toUpperCase() === 'X' ? 'Memorized' : 'Not Learned';
        instrument = instrumentColumn;
      }

      return {
        name: col(row, 'Name'),
        type: col(row, 'Type'),
        key: col(row, 'Key'),
        parts: col(row, 'Parts'),
        incipit_a: col(row, 'Incipit A'),
        incipit_b: col(row, 'Incipit B'),
        incipit_c: col(row, 'Incipit C'),
        learning_status,
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
        instrument,
        sequence_id: col(row, 'Sequence ID'),
        // Carried alongside the tune for the post-insert per-instrument pass.
        // db.insertManyTunes ignores fields it doesn't recognize.
        _instrumentStatuses,
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

  // Index existing tunes by lowercased name and by Thesession ID for dup checks.
  // existingByName carries per-name {type, sid} so we can refine the name-match
  // check: a shared name is only a duplicate signal if the existing tune doesn't
  // disagree on type or on a non-empty Thesession ID. Different tunes sometimes
  // share a name (e.g. "Last Night's Fun" exists as both a Reel and a Slip Jig).
  const existingByName = new Map();
  const existingSessionIds = new Set();
  for (const t of existingTunes) {
    const n = (t.name || '').toLowerCase().trim();
    const s = (t.thesession_id || '').trim();
    if (n) {
      if (!existingByName.has(n)) existingByName.set(n, []);
      existingByName.get(n).push({ type: (t.type || '').trim(), sid: s });
    }
    if (s) existingSessionIds.add(s);
  }

  function nameLooksLikeDup(name, type, sid) {
    const candidates = existingByName.get(name) || [];
    return candidates.some(c => {
      if (type && c.type && type !== c.type) return false;
      if (sid && c.sid && sid !== c.sid) return false;
      return true;
    });
  }

  const toImport = [];
  const errorRows = [];

  for (const tune of tunes) {
    const name = (tune.name || '').toLowerCase().trim();
    const sid = (tune.thesession_id || '').trim();
    const type = (tune.type || '').trim();
    const reasons = [];

    if (name && nameLooksLikeDup(name, type, sid)) reasons.push(`name "${tune.name}" already exists`);
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
      if (name) {
        if (!existingByName.has(name)) existingByName.set(name, []);
        existingByName.get(name).push({ type, sid });
      }
      if (sid) existingSessionIds.add(sid);
    }
  }

  try {
    const imported = toImport.length > 0 ? await db.insertManyTunes(req.user.id, toImport) : [];

    // Populate tune_instrument_status from per-instrument columns (if used)
    // or from the legacy Instrument list + legacy Learned status (sync logic).
    if (usePerInstrument) {
      const bulkRows = [];
      for (let i = 0; i < imported.length; i++) {
        const map = toImport[i]._instrumentStatuses;
        if (!map) continue;
        for (const [instrument, status] of map) {
          bulkRows.push({ tune_id: imported[i].id, instrument, status });
        }
      }
      if (bulkRows.length > 0) await db.bulkInsertTuneInstrumentStatuses(bulkRows);
    } else {
      // Legacy CSV path. Pass the row's resolved learning_status as the
      // default for newly-created per-instrument rows so `Learned=X` continues
      // to produce Memorized rows (matching design Phase 1 migration logic).
      for (let i = 0; i < imported.length; i++) {
        await db.syncTuneInstrumentRows(
          imported[i].id, req.user.id,
          toImport[i].instrument, toImport[i].learning_status
        );
      }
    }

    res.json({
      imported: imported.length,
      duplicates: errorRows.length,
      errorRows,
      createdIds: imported.map(t => t.id),
      perInstrumentMode: usePerInstrument,
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error during import: ' + err.message });
  }
});

const VALID_STATUSES = ['Not Learned', 'Learning', 'Memorized'];

// --- Per-instrument learning status (design/PerInstrumentStatus.md) ---

router.get('/:id/instruments', async (req, res) => {
  try {
    const tune = await db.getTuneById(req.params.id, req.user.id);
    if (!tune) return res.status(404).json({ error: 'Tune not found.' });
    res.json(await db.getTuneInstrumentStatuses(req.params.id, req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/instruments/:instrument', async (req, res) => {
  try {
    const status = (req.body && req.body.status) || 'Not Learned';
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}.` });
    }
    const result = await db.setTuneInstrumentStatus(
      req.params.id, req.user.id, req.params.instrument, status
    );
    if (result === null) return res.status(404).json({ error: 'Tune not found.' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/instruments/:instrument', async (req, res) => {
  try {
    const result = await db.deleteTuneInstrumentStatus(
      req.params.id, req.user.id, req.params.instrument
    );
    if (result === null) return res.status(404).json({ error: 'Tune not found.' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// --- Attachment routes ---

router.get('/:id/images', async (req, res) => {
  try {
    const list = await db.getTuneImageList(req.params.id, req.user.id);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/image/:imageId', async (req, res) => {
  try {
    const image = await db.getTuneImageData(req.params.imageId, req.params.id, req.user.id);
    if (!image) return res.status(404).send('Not found.');
    // Image rows are immutable: ids are SERIAL (never reused) and there is no
    // UPDATE path, so a strong ETag tied to the row id is enough to revalidate.
    res.set('ETag', `"img-${req.params.imageId}"`);
    if (image.created_at) {
      res.set('Last-Modified', new Date(image.created_at).toUTCString());
    }
    res.set('Cache-Control', 'private, max-age=3600, immutable');
    res.set('Content-Type', image.mime_type);
    if (req.fresh) return res.status(304).end();
    const buf = Buffer.isBuffer(image.data)
      ? image.data
      : Buffer.from(String(image.data).replace(/^\\x/, ''), 'hex');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/image', uploadImage.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required.' });
    const { mimetype, originalname, buffer } = req.file;
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      return res.status(400).json({ error: 'Only JPEG, PNG, and PDF files are supported.' });
    }
    const tune = await db.getTuneById(req.params.id, req.user.id);
    if (!tune) return res.status(404).json({ error: 'Tune not found.' });
    const image = await db.addTuneImage(tune.id, req.user.id, originalname, mimetype, buffer);
    res.json(image);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/image/:imageId', async (req, res) => {
  try {
    await db.deleteTuneImage(req.params.imageId, req.params.id, req.user.id);
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
      const basename = path.basename(filename, path.extname(filename));
      const digitRuns = basename.match(/\d+/g) || [];
      const matchedTune = digitRuns.map(d => sidToTune[d]).find(Boolean);
      if (!matchedTune) { unmatched.push(filename); continue; }
      await db.addTuneImage(matchedTune.id, req.user.id, filename, mimeType, buffer);
      imported++;
    }

    res.json({ imported, unmatched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
