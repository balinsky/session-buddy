const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { Readable } = require('stream');
const { createHash } = require('crypto');
const tar = require('tar');
const { parse } = require('csv-parse/sync');
const db = require('../db/database');
const requireUser = require('../middleware/requireUser');
const { col } = require('../utils/csv');

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
      if (path.basename(entry.path).startsWith('._')) { entry.resume(); return; }
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

// Literal-path POST routes declared before /:id so Express does not treat
// "import" or "import-images" as an id parameter.

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
        name: normalizeApostrophes(col(row, 'Name')),
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
        tunebooks: parseInt((col(row, 'Tunebooks') || '').replace(/,/g, '')) || null,
        date_learned: col(row, 'Date Learned'),
        favorite: col(row, 'Favorite').toUpperCase() === 'X' ? 1 : 0,
        thesession_id: col(row, 'Thesession ID'),
        setting: col(row, 'Setting'),
        notes: col(row, 'Notes'),
        alternate_titles: normalizeApostrophes(col(row, 'Alternate Titles')),
        composer: col(row, 'Composer'),
        last_practiced_date: col(row, 'Last Practiced Date'),
        instrument,
        sequence_id: col(row, 'Sequence ID'),
        // Carried alongside the tune for the post-insert per-instrument pass.
        // db.insertManyTunes ignores fields it doesn't recognize.
        _instrumentStatuses,
        // Phase 4: optional class name from CSV (find-or-create on import).
        _className: col(row, 'Class').trim(),
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

  // Index existing tunes for dup checks. Store full tune objects so that when a
  // CSV row is a dup with a Class column, we can find the existing tune's id to
  // attach the class (design/Classes.md, Phase 4).
  //
  // existingByName maps lowercased name → tune[]. Multiple entries are possible
  // when different tunes share a name (e.g. "Last Night's Fun" as Reel and Slip
  // Jig): a shared name is only a dup signal when types and SIDs don't disagree.
  const existingByName = new Map();
  const existingBySid = new Map();
  for (const t of existingTunes) {
    const n = (t.name || '').toLowerCase().trim();
    const s = (t.thesession_id || '').trim();
    if (n) {
      if (!existingByName.has(n)) existingByName.set(n, []);
      existingByName.get(n).push(t);
    }
    if (s) existingBySid.set(s, t);
  }

  function nameLooksLikeDup(name, type, sid) {
    const candidates = existingByName.get(name) || [];
    return candidates.some(t => {
      const ct = (t.type || '').trim();
      const cs = (t.thesession_id || '').trim();
      if (type && ct && type !== ct) return false;
      if (sid && cs && sid !== cs) return false;
      return true;
    });
  }

  // Returns the existing tune that matches by SID (preferred) or name.
  function findExistingTune(name, sid, type) {
    if (sid) {
      const bySid = existingBySid.get(sid);
      if (bySid) return bySid;
    }
    const candidates = (existingByName.get(name) || []).filter(t => {
      const ct = (t.type || '').trim();
      const cs = (t.thesession_id || '').trim();
      if (type && ct && type !== ct) return false;
      if (sid && cs && sid !== cs) return false;
      return true;
    });
    return candidates[0] || null;
  }

  const toImport = [];
  const errorRows = [];
  // Phase 4: rows where the CSV tune matched an existing tune AND had a Class
  // column — the class is attached rather than skipping the row.
  const classAttachPending = [];

  for (const tune of tunes) {
    const name = (tune.name || '').toLowerCase().trim();
    const sid = (tune.thesession_id || '').trim();
    const type = (tune.type || '').trim();
    const reasons = [];

    if (name && nameLooksLikeDup(name, type, sid)) reasons.push(`name "${tune.name}" already exists`);
    if (sid && existingBySid.has(sid)) reasons.push(`Thesession ID ${sid} already exists`);

    if (reasons.length > 0) {
      if (tune._className) {
        // Dup row with a class — attach the class to the existing tune instead
        // of skipping the row.
        const existingTune = findExistingTune(name, sid, type);
        classAttachPending.push({ tune, existingTuneId: existingTune ? existingTune.id : null });
      } else {
        errorRows.push({
          Name: tune.name,
          Type: tune.type || '',
          Key: tune.key || '',
          'Thesession ID': tune.thesession_id || '',
          Errors: reasons.join('; '),
          Notes: '',
        });
      }
    } else {
      toImport.push(tune);
      if (name) {
        if (!existingByName.has(name)) existingByName.set(name, []);
        existingByName.get(name).push(tune);
      }
      if (sid) existingBySid.set(sid, tune);
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

    // Phase 4: attach classes to newly-imported tunes and to existing tunes
    // matched via classAttachPending. Each class name is found-or-created.
    let classesAttached = 0;
    const classAttachRows = [];  // entries shown in the "notes" download

    // New tunes that have a Class column
    for (let i = 0; i < imported.length; i++) {
      const className = toImport[i]._className;
      if (!className) continue;
      const klass = await db.findOrCreateClassByName(req.user.id, className);
      await db.attachTuneToClass(imported[i].id, klass.id);
      classesAttached++;
    }

    // Existing tunes where the dup row had a Class column
    for (const { tune, existingTuneId } of classAttachPending) {
      const note = { Name: tune.name, Type: tune.type || '', Key: tune.key || '',
        'Thesession ID': tune.thesession_id || '', Errors: '', Notes: '' };
      if (!existingTuneId) {
        note.Notes = `Could not locate existing tune to attach class "${tune._className}"`;
      } else {
        const klass = await db.findOrCreateClassByName(req.user.id, tune._className);
        await db.attachTuneToClass(existingTuneId, klass.id);
        classesAttached++;
        note.Notes = `Class "${tune._className}" attached to existing tune`;
      }
      classAttachRows.push(note);
    }

    res.json({
      imported: imported.length,
      duplicates: errorRows.length,
      classesAttached,
      errorRows,
      classAttachRows,
      createdIds: imported.map(t => t.id),
      perInstrumentMode: usePerInstrument,
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error during import: ' + err.message });
  }
});

function normalizeApostrophes(s) {
  if (!s) return s;
  return s.replace(/[‘’‛ʼʻ´＇`ˈ]/g, "’");
}

function normalizeForNameMatch(s) {
  return normalizeApostrophes(s)
    .toLowerCase()
    // Normalize number variants: "No. 2", "No 2", "Number 2", "#2" → "no 2"
    .replace(/\bno\.?\s*(\d)/g, "no $1")
    .replace(/\bnumber\s+(\d)/g, "no $1")
    .replace(/#\s*(\d)/g, "no $1")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Removes parenthetical and bracketed annotations, e.g. "(Alina Transcription)" or "[draft]"
function stripParentheticals(s) {
  return s.replace(/\s*\([^)]*\)/g, "").replace(/\s*\[[^\]]*\]/g, "").trim();
}

// Longest / multi-word entries first so 'slip jig' is tried before 'jig'
const TUNE_TYPE_SUFFIXES = [
  'slip jig', 'hop jig', '3/2 tune', '7/8 tune',
  'strathspey', 'barndance', 'hornpipe', 'highland', 'shetland',
  'gavotte', 'mazurka',
  'fling', 'march', 'polka', 'ridee', 'slide', 'waltz',
  'reel', 'rond',
  'air', 'jig',
];

// Strips a leading "The/A/An" or a trailing ", The/A/An" (or both)
function stripArticles(s) {
  return s.replace(/^(the|a|an) /, '').replace(/, (the|a|an)$/, '').trim();
}

function stripTuneTypeSuffix(s) {
  for (const type of TUNE_TYPE_SUFFIXES) {
    if (s.endsWith(' ' + type)) {
      const stripped = s.slice(0, -(type.length + 1)).trim();
      return stripped.length ? stripped : null;
    }
  }
  return null;
}

function findTuneMatch(nameMap, coreMap, normalizedBase) {
  // 1. Exact normalized match
  if (nameMap[normalizedBase]) return nameMap[normalizedBase];

  // 2. Article-stripped filename vs article-stripped DB names
  if (coreMap[stripArticles(normalizedBase)]) return coreMap[stripArticles(normalizedBase)];

  // 3. Type suffix stripped, then same two lookups
  const noType = stripTuneTypeSuffix(normalizedBase);
  if (noType) {
    if (nameMap[noType]) return nameMap[noType];
    if (coreMap[stripArticles(noType)]) return coreMap[stripArticles(noType)];
  }

  return null;
}

router.post('/import-images', uploadTarball.single('tarball'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Tarball file required.' });

    const allTunes = await db.getTunesByUser(req.user.id);
    const nameMap = {};
    const coreMap = {};
    for (const tune of allTunes) {
      if (!tune.name) continue;
      const norm = normalizeForNameMatch(tune.name);
      if (!nameMap[norm]) nameMap[norm] = tune;
      const core = stripArticles(norm);
      if (!coreMap[core]) coreMap[core] = tune;
      // Also index alternate titles
      if (tune.alternate_titles) {
        for (const alt of tune.alternate_titles.split(',')) {
          const altNorm = normalizeForNameMatch(alt.trim());
          if (altNorm && !nameMap[altNorm]) nameMap[altNorm] = tune;
          const altCore = stripArticles(altNorm);
          if (altCore && !coreMap[altCore]) coreMap[altCore] = tune;
        }
      }
    }

    // Load all sets with their tunes for multi-title set matching
    const allSets = await db.getSetsByUser(req.user.id);
    const setTuneIds = new Map();
    for (const set of allSets) {
      setTuneIds.set(set.id, new Set(set.tunes.map(t => t.id)));
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
      const baseName = path.basename(filename, path.extname(filename));
      const cleaned = stripParentheticals(baseName);
      const parts = cleaned.split(' - ').map(s => s.trim()).filter(Boolean);

      if (parts.length === 1) {
        // Single title: fuzzy-match a tune
        const matchedTune = findTuneMatch(nameMap, coreMap, normalizeForNameMatch(parts[0]));
        if (!matchedTune) {
          unmatched.push({ filename, reason: `No tune found matching "${parts[0]}"` });
          continue;
        }
        const checksum = createHash('sha256').update(buffer).digest('hex');
        await db.addTuneImage(matchedTune.id, req.user.id, filename, mimeType, buffer, checksum);
        imported++;
      } else {
        // Multi-title: all parts must match tunes, then find a set containing all of them
        const matchedTuneIds = [];
        const unmatchedParts = [];
        for (const part of parts) {
          const tune = findTuneMatch(nameMap, coreMap, normalizeForNameMatch(part));
          if (tune) matchedTuneIds.push(tune.id);
          else unmatchedParts.push(part);
        }
        if (unmatchedParts.length > 0) {
          unmatched.push({ filename, reason: `Could not match tune name(s): ${unmatchedParts.map(p => `"${p}"`).join(', ')}` });
          continue;
        }
        const matchingSets = allSets.filter(set => {
          const ids = setTuneIds.get(set.id);
          return matchedTuneIds.every(id => ids.has(id));
        });
        if (matchingSets.length === 0) {
          unmatched.push({ filename, reason: `No set found containing all ${parts.length} matched tunes` });
        } else if (matchingSets.length > 1) {
          const setDesc = matchingSets.map(s => `#${s.id}`).join(', ');
          unmatched.push({ filename, reason: `Matched multiple sets (${setDesc}) — ambiguous` });
        } else {
          const checksum = createHash('sha256').update(buffer).digest('hex');
          await db.addSetImage(matchingSets[0].id, req.user.id, filename, mimeType, buffer, checksum);
          imported++;
        }
      }
    }

    res.json({ imported, unmatched });
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
    req.body.name = normalizeApostrophes(req.body.name);
    if (req.body.alternate_titles) req.body.alternate_titles = normalizeApostrophes(req.body.alternate_titles);
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
    req.body.name = normalizeApostrophes(req.body.name);
    if (req.body.alternate_titles) req.body.alternate_titles = normalizeApostrophes(req.body.alternate_titles);
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
    // Returns own tune images plus any images from sets containing this tune.
    // Each item includes `source` ('tune'|'set') and `source_id` for URL routing.
    const list = await db.getTuneImagesAll(req.params.id, req.user.id);
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

// --- Practice log ---

const VALID_EVENT_TYPES = ['practice', 'session', 'class'];

router.get('/:id/practice-log', async (req, res) => {
  try {
    const tune = await db.getTuneById(req.params.id, req.user.id);
    if (!tune) return res.status(404).json({ error: 'Tune not found.' });
    res.json(await db.getPracticeLog(req.params.id, req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/practice-log', async (req, res) => {
  try {
    const { date, event_type, instrument, notes } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required.' });
    if (!VALID_EVENT_TYPES.includes(event_type)) {
      return res.status(400).json({ error: `event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}.` });
    }
    if (!instrument) return res.status(400).json({ error: 'instrument is required.' });
    const entry = await db.addPracticeLogEntry(req.params.id, req.user.id, { date, event_type, instrument, notes });
    if (!entry) return res.status(404).json({ error: 'Tune not found.' });
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/practice-log/:eventId', async (req, res) => {
  try {
    await db.deletePracticeLogEntry(req.params.eventId, req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
