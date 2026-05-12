// Class and Class Series CRUD (design/Classes.md, phase 2). Routes here both
// live under /api/classes/* and /api/class-series/* (same router, separate
// path prefixes via the express mount in server.js? — no, easier: we mount
// this once at /api and it owns both prefixes).

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db/database');
const requireUser = require('../middleware/requireUser');
const { col } = require('../utils/csv');

const upload = multer({ storage: multer.memoryStorage() });

// Semicolons separate multi-value cells (instructors, tunes). A plain split
// would leave stray whitespace around separators, so we trim each piece.
function splitSemi(str) {
  return (str || '').split(';').map(s => s.trim()).filter(Boolean);
}

function csvRow(klass) {
  const seriesName = klass.series ? klass.series.name : '';
  const instructors = (klass.instructors || []).map(m => m.name).join('; ');
  const tunes = klass.tunes || [];
  const tuneNames = tunes.map(t => t.name).join('; ');
  const tuneIds = tunes.map(t => t.thesession_id || '').join('; ');
  return [
    klass.name,
    seriesName,
    klass.organizer || '',
    klass.instrument || '',
    klass.date || '',
    klass.notes || '',
    instructors,
    tuneNames,
    tuneIds,
  ];
}

function buildCsv(headers, rows) {
  const escape = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map(r => r.map(escape).join(',')).join('\r\n');
}

router.use(requireUser);

// --- /api/classes -------------------------------------------------------

router.get('/classes', async (req, res) => {
  try {
    res.json(await db.getClassesByUser(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export and import must be declared before GET /classes/:id so that the
// literal path segment "export" / "import" is matched before Express tries
// to parse it as an :id parameter.

// --- /api/classes/export ------------------------------------------------

const CSV_HEADERS = ['Name', 'Series', 'Organizer', 'Instrument', 'Date', 'Notes', 'Instructors', 'Tune Names', 'Tune IDs'];

router.get('/classes/export', async (req, res) => {
  try {
    const classes = await db.getClassesWithDetails(req.user.id);
    const csv = buildCsv(CSV_HEADERS, classes.map(csvRow));
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="classes.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- /api/classes/import ------------------------------------------------

router.post('/classes/import', upload.single('csv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file is required.' });

  let records;
  try {
    records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch (err) {
    return res.status(400).json({ error: 'Could not parse CSV: ' + err.message });
  }



  // Load existing classes, series, and tunes for dup/match checks.
  let existingClasses, existingTunes;
  try {
    [existingClasses, existingTunes] = await Promise.all([
      db.getClassesByUser(req.user.id),
      db.getTunesByUser(req.user.id),
    ]);
  } catch (err) {
    return res.status(500).json({ error: 'Could not load existing data: ' + err.message });
  }

  // Existing class dup index: dupKey -> class object, keyed by "name|series_id".
  // Also keep a name-only index for fallback when the series differs.
  const existingClassMap = new Map(
    existingClasses.map(c => [`${(c.name || '').toLowerCase()}|${c.series_id ?? ''}`, c])
  );
  const existingClassByName = new Map();
  for (const c of existingClasses) {
    const n = (c.name || '').toLowerCase();
    if (!existingClassByName.has(n)) existingClassByName.set(n, []);
    existingClassByName.get(n).push(c);
  }

  // Tune lookup indexes.
  const tuneByThesessionId = new Map();
  const tuneByName = new Map();
  for (const t of existingTunes) {
    if (t.thesession_id) tuneByThesessionId.set(t.thesession_id.trim(), t);
    const n = (t.name || '').toLowerCase().trim();
    if (n && !tuneByName.has(n)) tuneByName.set(n, t);
  }

  // Resolve tunes from a CSV row; returns array of matched tune IDs and pushes
  // an error row for each unmatched entry.
  function resolveRowTunes(name, seriesName, row) {
    const tuneNamesList = splitSemi(col(row, 'Tune Names'));
    const tuneIdsList = splitSemi(col(row, 'Tune IDs'));
    const maxTunes = Math.max(tuneNamesList.length, tuneIdsList.length);
    const ids = [];
    for (let i = 0; i < maxTunes; i++) {
      const sid = (tuneIdsList[i] || '').trim();
      const tName = (tuneNamesList[i] || '').trim();
      let tune = sid ? tuneByThesessionId.get(sid) : null;
      if (!tune && tName) tune = tuneByName.get(tName.toLowerCase());
      if (tune) {
        ids.push(tune.id);
      } else {
        const desc = sid ? `ID ${sid}` : `"${tName}"`;
        errorRows.push({ Name: name, Series: seriesName, Error: `Tune ${desc} not found — class imported without it` });
      }
    }
    return ids;
  }

  const imported = [];
  const errorRows = [];
  let skipped = 0;
  let tunesAttached = 0;

  for (const row of records) {
    const name = col(row, 'Name').trim();
    if (!name) continue;

    // Resolve series (find-or-create).
    const seriesName = col(row, 'Series').trim();
    let seriesId = null;
    if (seriesName) {
      try {
        const series = await db.findOrCreateSeriesByName(req.user.id, seriesName);
        seriesId = series.id;
      } catch (err) {
        errorRows.push({ Name: name, Series: seriesName, Error: 'Could not create series: ' + err.message });
        continue;
      }
    }

    // Dup check: exact match on name + series first; fall back to name-only if
    // exactly one class with that name exists (handles the case where the class
    // was created without a series or with a different series in the DB).
    const dupKey = `${name.toLowerCase()}|${seriesId ?? ''}`;
    const nameCandidates = existingClassByName.get(name.toLowerCase()) || [];
    const existingClass = existingClassMap.get(dupKey) ||
      (nameCandidates.length === 1 ? nameCandidates[0] : null);
    if (existingClass) {
      // Attach any tunes from this row to the existing class instead of skipping.
      const tuneIds = resolveRowTunes(name, seriesName, row);
      if (tuneIds.length === 0) {
        skipped++;
        errorRows.push({ Name: name, Series: seriesName, Error: 'Class already exists (skipped)' });
      } else {
        let attached = 0;
        for (const tid of tuneIds) {
          try {
            await db.attachTuneToClass(tid, existingClass.id);
            attached++;
          } catch (err) {
            errorRows.push({ Name: name, Series: seriesName, Error: `Could not attach tune: ${err.message}` });
          }
        }
        tunesAttached += attached;
        if (attached > 0) {
          errorRows.push({ Name: name, Series: seriesName, Error: `Class already exists — ${attached} tune${attached !== 1 ? 's' : ''} added` });
        } else {
          skipped++;
          errorRows.push({ Name: name, Series: seriesName, Error: 'Class already exists (skipped)' });
        }
      }
      continue;
    }

    // Resolve instructors (find-or-create musicians).
    const instructorNames = splitSemi(col(row, 'Instructors'));
    const instructorIds = [];
    for (const iName of instructorNames) {
      try {
        const m = await db.findOrCreateMusicianByName(req.user.id, iName);
        instructorIds.push(m.id);
      } catch (err) {
        errorRows.push({ Name: name, Series: seriesName, Error: `Could not create musician "${iName}": ${err.message}` });
      }
    }

    const tuneIds = resolveRowTunes(name, seriesName, row);

    // Create the class.
    try {
      const klass = await db.createClass(req.user.id, {
        name,
        series_id: seriesId,
        organizer: col(row, 'Organizer').trim() || null,
        instrument: col(row, 'Instrument').trim() || null,
        date: col(row, 'Date').trim() || null,
        notes: col(row, 'Notes').trim() || null,
        tune_ids: tuneIds,
        instructor_ids: instructorIds,
      });
      imported.push(klass.id);
      existingClassMap.set(dupKey, { id: klass.id });  // prevent double-import in same file
    } catch (err) {
      errorRows.push({ Name: name, Series: seriesName, Error: 'Database error: ' + err.message });
    }
  }

  res.json({ imported: imported.length, skipped, tunesAttached, errorRows, createdIds: imported });
});

router.get('/classes/:id', async (req, res) => {
  try {
    const klass = await db.getClassById(req.params.id, req.user.id);
    if (!klass) return res.status(404).json({ error: 'Class not found.' });
    res.json(klass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/classes', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Class name is required.' });
    const klass = await db.createClass(req.user.id, req.body);
    res.status(201).json(klass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/classes/:id', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Class name is required.' });
    const klass = await db.updateClass(req.params.id, req.user.id, req.body);
    if (!klass) return res.status(404).json({ error: 'Class not found.' });
    res.json(klass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/classes/:id', async (req, res) => {
  try {
    await db.deleteClass(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- /api/class-series --------------------------------------------------

router.get('/class-series', async (req, res) => {
  try {
    res.json(await db.getClassSeriesByUser(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/class-series/:id', async (req, res) => {
  try {
    const series = await db.getClassSeriesById(req.params.id, req.user.id);
    if (!series) return res.status(404).json({ error: 'Series not found.' });
    res.json(series);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/class-series', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Series name is required.' });
    const series = await db.createClassSeries(req.user.id, req.body);
    res.status(201).json(series);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/class-series/:id', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Series name is required.' });
    const series = await db.updateClassSeries(req.params.id, req.user.id, req.body);
    if (!series) return res.status(404).json({ error: 'Series not found.' });
    res.json(series);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/class-series/:id', async (req, res) => {
  try {
    await db.deleteClassSeries(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
