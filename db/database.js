const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      sync_code TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tunes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT,
      key TEXT,
      parts TEXT,
      incipit_a TEXT,
      incipit_b TEXT,
      incipit_c TEXT,
      count INTEGER DEFAULT 0,
      added_date TEXT,
      where_learned TEXT,
      who TEXT,
      mnemonic TEXT,
      tunebooks TEXT,
      date_learned TEXT,
      favorite INTEGER DEFAULT 0,
      thesession_id TEXT,
      setting TEXT,
      notes TEXT,
      composer TEXT,
      last_practiced_date TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS set_tunes (
      id SERIAL PRIMARY KEY,
      set_id INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
      tune_id INTEGER NOT NULL REFERENCES tunes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL
    )
  `);
  // Add new columns to existing databases that predate these fields
  await pool.query(`ALTER TABLE tunes ADD COLUMN IF NOT EXISTS sequence_id TEXT`);
  await pool.query(`ALTER TABLE tunes ADD COLUMN IF NOT EXISTS alternate_titles TEXT`);
  await pool.query(`ALTER TABLE sets ADD COLUMN IF NOT EXISTS favorite INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE sets ADD COLUMN IF NOT EXISTS last_practiced_date TEXT`);
  // Phase 6 of design/PerInstrumentStatus.md: the legacy single-status and
  // playable-instrument-list columns are retired. Status and the playable
  // list both live in tune_instrument_status now. IF EXISTS makes this
  // idempotent for fresh databases that never had the columns.
  await pool.query(`ALTER TABLE tunes DROP COLUMN IF EXISTS learning_status`);
  await pool.query(`ALTER TABLE tunes DROP COLUMN IF EXISTS instrument`);
  // Indexes on foreign keys used in every read operation
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tunes_user_id ON tunes(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sets_user_id ON sets(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_set_tunes_set_id ON set_tunes(set_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_set_tunes_tune_id ON set_tunes(tune_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tune_images (
      id SERIAL PRIMARY KEY,
      tune_id INTEGER NOT NULL REFERENCES tunes(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Drop the unique constraint that prevented multiple attachments per tune
  await pool.query(`ALTER TABLE tune_images DROP CONSTRAINT IF EXISTS tune_images_tune_id_key`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tune_images_tune_id ON tune_images(tune_id)`);
  await pool.query(`ALTER TABLE tune_images ADD COLUMN IF NOT EXISTS checksum TEXT`);
  // Partial unique index: prevents the same image being attached to a tune twice,
  // while still allowing multiple distinct images per tune.
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tune_images_dedup ON tune_images(tune_id, user_id, checksum) WHERE checksum IS NOT NULL`);
  // Set-level scores/images. Same structure as tune_images but keyed on set_id.
  // A multi-tune PDF is stored once here; tunes access it via set_tunes JOIN.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS set_images (
      id SERIAL PRIMARY KEY,
      set_id INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data BYTEA NOT NULL,
      checksum TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_set_images_set_id ON set_images(set_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_set_images_dedup ON set_images(set_id, user_id, checksum) WHERE checksum IS NOT NULL`);
  // Per-instrument learning status (design/PerInstrumentStatus.md). The
  // compound primary key covers tune_id-leading queries, so no separate FK
  // index is needed. As of Phase 6, this table is the sole source of truth
  // for both status and the per-tune playable instrument list.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tune_instrument_status (
      tune_id INTEGER NOT NULL REFERENCES tunes(id) ON DELETE CASCADE,
      instrument TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Not Learned',
      PRIMARY KEY (tune_id, instrument)
    )
  `);

  // --- Classes feature, phase 1 (design/Classes.md) ---------------------
  // Class is a single event (workshop, retreat session, weekly class
  // meeting). class_series optionally groups related classes (e.g. a
  // 6-week course). musician is currently used only as a class instructor;
  // the broader "replace tunes.who" use case lands later. class_tunes is
  // the M:N from a class to the tunes it taught; class_instructors is the
  // M:N from a class to its instructor musicians.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_series (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      organizer TEXT,
      instrument TEXT,
      date_from DATE,
      date_to DATE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      series_id INTEGER REFERENCES class_series(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      organizer TEXT,
      instrument TEXT,
      date DATE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS musician (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      instruments TEXT,
      website TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_tunes (
      class_id INTEGER NOT NULL REFERENCES class(id) ON DELETE CASCADE,
      tune_id INTEGER NOT NULL REFERENCES tunes(id) ON DELETE CASCADE,
      PRIMARY KEY (class_id, tune_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_instructors (
      class_id INTEGER NOT NULL REFERENCES class(id) ON DELETE CASCADE,
      musician_id INTEGER NOT NULL REFERENCES musician(id) ON DELETE CASCADE,
      PRIMARY KEY (class_id, musician_id)
    )
  `);
  // FK indexes (the compound PKs cover the leading-column lookups; the other
  // direction needs an explicit index for ON DELETE CASCADE efficiency).
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_class_user_id ON class(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_class_series_id ON class(series_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_class_series_user_id ON class_series(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_musician_user_id ON musician(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_class_tunes_tune_id ON class_tunes(tune_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_class_instructors_musician_id ON class_instructors(musician_id)`);

  // Broader Musician feature: link tunes.who to a musician entity.
  await pool.query(`ALTER TABLE tunes ADD COLUMN IF NOT EXISTS who_musician_id INTEGER REFERENCES musician(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE musician ADD COLUMN IF NOT EXISTS is_session_player BOOLEAN DEFAULT false`);
  // Auto-match: tunes whose who text exactly matches a musician name (case-insensitive). Idempotent.
  await pool.query(`
    UPDATE tunes t SET who_musician_id = m.id
    FROM musician m
    WHERE t.user_id = m.user_id
      AND t.who_musician_id IS NULL
      AND t.who IS NOT NULL AND t.who != ''
      AND LOWER(TRIM(t.who)) = LOWER(TRIM(m.name))
  `);

  // Practice log: one row per practice/session/class event on a tune.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS practice_log (
      id SERIAL PRIMARY KEY,
      tune_id INTEGER NOT NULL REFERENCES tunes(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'practice',
      instrument TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_practice_log_tune_id ON practice_log(tune_id, user_id)`);
}

// --- Users ---

async function getUserBySyncCode(syncCode) {
  const { rows } = await pool.query('SELECT * FROM users WHERE sync_code = $1', [syncCode]);
  return rows[0] || null;
}

async function createUser(syncCode) {
  const { rows } = await pool.query(
    'INSERT INTO users (sync_code) VALUES ($1) RETURNING *',
    [syncCode]
  );
  return rows[0];
}

// --- Tunes ---

async function getTunesByUser(userId) {
  const { rows: tunes } = await pool.query(
    `SELECT t.*, m.name AS who_musician_name
     FROM tunes t
     LEFT JOIN musician m ON m.id = t.who_musician_id
     WHERE t.user_id = $1`,
    [userId]
  );
  if (tunes.length === 0) return tunes;
  // Attach per-instrument statuses so the list view can compute best-of and
  // detect multi-instrument tunes (design/PerInstrumentStatus.md, Phase 3).
  const ids = tunes.map(t => t.id);
  const { rows: statuses } = await pool.query(
    `SELECT tune_id, instrument, status
     FROM tune_instrument_status WHERE tune_id = ANY($1::int[])
     ORDER BY tune_id, instrument`,
    [ids]
  );
  const byTune = new Map();
  for (const s of statuses) {
    if (!byTune.has(s.tune_id)) byTune.set(s.tune_id, []);
    byTune.get(s.tune_id).push({ instrument: s.instrument, status: s.status });
  }
  // Attach class_ids so the tune-list view can filter by class
  // (design/Classes.md, Phase 3) without an extra round-trip per tune.
  const { rows: classLinks } = await pool.query(
    `SELECT tune_id, class_id FROM class_tunes WHERE tune_id = ANY($1::int[])`,
    [ids]
  );
  const classIdsByTune = new Map();
  for (const link of classLinks) {
    if (!classIdsByTune.has(link.tune_id)) classIdsByTune.set(link.tune_id, []);
    classIdsByTune.get(link.tune_id).push(link.class_id);
  }
  for (const t of tunes) {
    t.instrument_statuses = byTune.get(t.id) || [];
    t.class_ids = classIdsByTune.get(t.id) || [];
  }
  return tunes;
}

async function getTuneById(id, userId) {
  const { rows } = await pool.query(
    `SELECT t.*,
      EXISTS(SELECT 1 FROM tune_images WHERE tune_id = t.id) AS has_image
     FROM tunes t
     WHERE t.id = $1 AND t.user_id = $2`,
    [id, userId]
  );
  if (!rows[0]) return null;
  // Attach the who_musician object when the tune has a linked musician.
  if (rows[0].who_musician_id) {
    const { rows: mRows } = await pool.query(
      'SELECT * FROM musician WHERE id = $1',
      [rows[0].who_musician_id]
    );
    rows[0].who_musician = mRows[0] || null;
  } else {
    rows[0].who_musician = null;
  }
  // Attach the classes this tune belongs to (Phase 2e of design/Classes.md).
  // Includes the parent series' name so the tune detail can show context
  // like "OAIM Spring 2025 Whistle — Class 3" without a second round-trip.
  const { rows: classes } = await pool.query(
    `SELECT c.id, c.name, c.organizer, c.instrument, c.date, c.series_id,
      cs.name AS series_name
     FROM class c
     JOIN class_tunes ct ON ct.class_id = c.id
     LEFT JOIN class_series cs ON cs.id = c.series_id
     WHERE ct.tune_id = $1 AND c.user_id = $2
     ORDER BY c.date DESC NULLS LAST, c.name`,
    [id, userId]
  );
  rows[0].classes = classes;
  return rows[0];
}

// Reconciles a tune's class_tunes rows from the tune side. Mirrors
// _syncClassTunes (which works from the class side) but used by the tune
// POST/PUT routes when the body includes class_ids. Verifies each class
// belongs to the same user before linking — a cross-user link would be a
// data leak.
async function syncTuneClasses(tuneId, userId, classIds) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM tunes WHERE id = $1 AND user_id = $2',
    [tuneId, userId]
  );
  if (rowCount === 0) return null;
  await pool.query('DELETE FROM class_tunes WHERE tune_id = $1', [tuneId]);
  for (const classId of classIds || []) {
    await pool.query(
      `INSERT INTO class_tunes (class_id, tune_id)
       SELECT $1, $2 FROM class WHERE id = $1 AND user_id = $3
       ON CONFLICT DO NOTHING`,
      [classId, tuneId, userId]
    );
  }
  return true;
}

// Find a class by name (case-insensitive) for this user, creating it if absent.
// Used by CSV import (design/Classes.md, Phase 4) — newly created classes have
// no instructors, instrument, or date; those can be filled in via the UI later.
async function findOrCreateClassByName(userId, name) {
  const { rows } = await pool.query(
    'SELECT * FROM class WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
    [userId, name]
  );
  if (rows[0]) return rows[0];
  const { rows: created } = await pool.query(
    'INSERT INTO class (user_id, name) VALUES ($1, $2) RETURNING *',
    [userId, name]
  );
  return created[0];
}

// Idempotent: attach a tune to a class. Safe to call even if the link already
// exists (ON CONFLICT DO NOTHING). No ownership check — callers must verify
// both the tune and class belong to the same user before calling.
async function attachTuneToClass(tuneId, classId) {
  await pool.query(
    'INSERT INTO class_tunes (class_id, tune_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [classId, tuneId]
  );
}

// Find a class series by name (case-insensitive) for this user, creating it
// if absent. Used by CSV import so rows can reference series by name.
async function findOrCreateSeriesByName(userId, name) {
  const { rows } = await pool.query(
    'SELECT * FROM class_series WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
    [userId, name]
  );
  if (rows[0]) return rows[0];
  const { rows: created } = await pool.query(
    'INSERT INTO class_series (user_id, name) VALUES ($1, $2) RETURNING *',
    [userId, name]
  );
  return created[0];
}

// Find a musician by name (case-insensitive) for this user, creating if absent.
// Used by class CSV import for instructor names.
async function findOrCreateMusicianByName(userId, name) {
  const { rows } = await pool.query(
    'SELECT * FROM musician WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
    [userId, name]
  );
  if (rows[0]) return rows[0];
  const { rows: created } = await pool.query(
    'INSERT INTO musician (user_id, name) VALUES ($1, $2) RETURNING *',
    [userId, name]
  );
  return created[0];
}

// Returns all classes for a user with instructors and tunes pre-joined, for
// Used by the CSV export endpoint. Batches series, instructors, and tunes
// into 4 queries total instead of 3N+1 via _enrichClass.
async function getClassesWithDetails(userId) {
  const { rows: classes } = await pool.query(
    'SELECT * FROM class WHERE user_id = $1 ORDER BY date DESC NULLS LAST, name',
    [userId]
  );
  if (classes.length === 0) return classes;
  const classIds = classes.map(c => c.id);

  const [seriesById, instructorsByClass, tunesByClass] =
    await _batchEnrichClasses(classIds, true);

  return classes.map(c => ({
    ...c,
    series: seriesById.get(c.series_id) || null,
    instructors: instructorsByClass.get(c.id) || [],
    tunes: tunesByClass ? tunesByClass.get(c.id) || [] : undefined,
  }));
}

// Per-tune column list. Status & playable instruments live in the
// tune_instrument_status table (Phase 6 of design/PerInstrumentStatus.md);
// the legacy `learning_status` and `instrument` columns are no longer read or
// written, even though they may still exist in the schema until the column
// drop in db.init().
function tuneParams(userId, data) {
  return [
    userId,
    data.name,
    data.type || null,
    data.key || null,
    data.parts || null,
    data.incipit_a || null,
    data.incipit_b || null,
    data.incipit_c || null,
    parseInt(data.count) || 0,
    data.added_date || null,
    data.where_learned || null,
    data.who || null,
    data.mnemonic || null,
    data.tunebooks || null,
    data.date_learned || null,
    data.favorite ? 1 : 0,
    data.thesession_id || null,
    data.setting || null,
    data.notes || null,
    data.composer || null,
    data.last_practiced_date || null,
    data.sequence_id || null,
    data.who_musician_id || null,
    data.alternate_titles || null,
  ];
}

async function createTune(userId, data) {
  const { rows } = await pool.query(`
    INSERT INTO tunes (
      user_id, name, type, key, parts,
      incipit_a, incipit_b, incipit_c,
      count, added_date, where_learned, who,
      mnemonic, tunebooks, date_learned, favorite,
      thesession_id, setting, notes, composer, last_practiced_date,
      sequence_id, who_musician_id, alternate_titles
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
    ) RETURNING *`,
    tuneParams(userId, data)
  );
  return rows[0];
}

async function updateTune(id, userId, data) {
  const params = [...tuneParams(userId, data).slice(1), id, userId];
  const { rows } = await pool.query(`
    UPDATE tunes SET
      name=$1, type=$2, key=$3, parts=$4,
      incipit_a=$5, incipit_b=$6, incipit_c=$7,
      count=$8, added_date=$9,
      where_learned=$10, who=$11, mnemonic=$12, tunebooks=$13,
      date_learned=$14, favorite=$15, thesession_id=$16,
      setting=$17, notes=$18, composer=$19, last_practiced_date=$20,
      sequence_id=$21, who_musician_id=$22, alternate_titles=$23
    WHERE id=$24 AND user_id=$25
    RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function deleteTune(id, userId) {
  await pool.query('DELETE FROM tunes WHERE id = $1 AND user_id = $2', [id, userId]);
}

async function insertManyTunes(userId, tunes) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const tune of tunes) {
      const { rows } = await client.query(`
        INSERT INTO tunes (
          user_id, name, type, key, parts,
          incipit_a, incipit_b, incipit_c,
          count, added_date, where_learned, who,
          mnemonic, tunebooks, date_learned, favorite,
          thesession_id, setting, notes, composer, last_practiced_date,
          sequence_id, who_musician_id, alternate_titles
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
        ) RETURNING *`,
        tuneParams(userId, tune)
      );
      results.push(rows[0]);
    }
    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --- Sets ---

async function getSetTunes(setId) {
  const { rows } = await pool.query(`
    SELECT t.*, st.position
    FROM tunes t
    JOIN set_tunes st ON t.id = st.tune_id
    WHERE st.set_id = $1
    ORDER BY st.position`,
    [setId]
  );
  if (rows.length === 0) return rows;
  // Attach class_ids so the set-list filter can match "any tune in this set
  // belongs to one of these classes" client-side (design/Classes.md, Phase 3).
  const ids = rows.map(t => t.id);
  const { rows: classLinks } = await pool.query(
    `SELECT tune_id, class_id FROM class_tunes WHERE tune_id = ANY($1::int[])`,
    [ids]
  );
  const classIdsByTune = new Map();
  for (const link of classLinks) {
    if (!classIdsByTune.has(link.tune_id)) classIdsByTune.set(link.tune_id, []);
    classIdsByTune.get(link.tune_id).push(link.class_id);
  }
  for (const t of rows) {
    t.class_ids = classIdsByTune.get(t.id) || [];
  }
  return rows;
}

async function getSetsByUser(userId) {
  const { rows: sets } = await pool.query(
    'SELECT * FROM sets WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  if (sets.length === 0) return sets;

  const setIds = sets.map(s => s.id);

  // One query for all tunes across all sets (replaces one getSetTunes call per set).
  const { rows: tuneRows } = await pool.query(`
    SELECT t.*, st.set_id, st.position
    FROM tunes t
    JOIN set_tunes st ON t.id = st.tune_id
    WHERE st.set_id = ANY($1::int[])
    ORDER BY st.set_id, st.position`,
    [setIds]
  );

  // One query for all class links across all those tunes.
  const tuneIds = [...new Set(tuneRows.map(t => t.id))];
  const classIdsByTune = new Map();
  if (tuneIds.length > 0) {
    const { rows: classLinks } = await pool.query(
      `SELECT tune_id, class_id FROM class_tunes WHERE tune_id = ANY($1::int[])`,
      [tuneIds]
    );
    for (const link of classLinks) {
      if (!classIdsByTune.has(link.tune_id)) classIdsByTune.set(link.tune_id, []);
      classIdsByTune.get(link.tune_id).push(link.class_id);
    }
  }

  // Attach class_ids and group tunes by set.
  const tunesBySet = new Map();
  for (const t of tuneRows) {
    t.class_ids = classIdsByTune.get(t.id) || [];
    if (!tunesBySet.has(t.set_id)) tunesBySet.set(t.set_id, []);
    tunesBySet.get(t.set_id).push(t);
  }

  return sets.map(set => ({ ...set, tunes: tunesBySet.get(set.id) || [] }));
}

async function getSetById(id, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM sets WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (!rows[0]) return null;
  return { ...rows[0], tunes: await getSetTunes(id) };
}

// Inserts set_tunes rows for a set in a single multi-row INSERT.
// tuneIds must already be validated; client must be inside a transaction.
async function _insertSetTunes(client, setId, tuneIds) {
  if (!tuneIds.length) return;
  const placeholders = tuneIds.map((_, i) =>
    `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
  ).join(', ');
  await client.query(
    `INSERT INTO set_tunes (set_id, tune_id, position) VALUES ${placeholders}`,
    tuneIds.flatMap((id, i) => [setId, id, i])
  );
}

async function createSet(userId, tuneIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO sets (user_id) VALUES ($1) RETURNING *',
      [userId]
    );
    await _insertSetTunes(client, rows[0].id, tuneIds);
    await client.query('COMMIT');
    return getSetById(rows[0].id, userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateSet(id, userId, tuneIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id FROM sets WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return null; }
    await client.query('DELETE FROM set_tunes WHERE set_id = $1', [id]);
    await _insertSetTunes(client, id, tuneIds);
    await client.query('COMMIT');
    return getSetById(id, userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteSet(id, userId) {
  await pool.query('DELETE FROM sets WHERE id = $1 AND user_id = $2', [id, userId]);
}

async function patchSet(id, userId, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  if (data.favorite !== undefined) {
    fields.push(`favorite = $${idx++}`);
    values.push(data.favorite ? 1 : 0);
  }
  if (data.last_practiced_date !== undefined) {
    fields.push(`last_practiced_date = $${idx++}`);
    values.push(data.last_practiced_date || null);
  }
  if (fields.length === 0) return getSetById(id, userId);
  values.push(id, userId);
  const { rows } = await pool.query(
    `UPDATE sets SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING id`,
    values
  );
  if (!rows[0]) return null;
  return getSetById(id, userId);
}

async function practiceSet(id, userId, date) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE sets SET last_practiced_date = $1 WHERE id = $2 AND user_id = $3 RETURNING id',
      [date, id, userId]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return null; }
    const tuneRows = await client.query(
      'SELECT tune_id FROM set_tunes WHERE set_id = $1', [id]
    );
    if (tuneRows.rows.length > 0) {
      const tuneIds = tuneRows.rows.map(r => r.tune_id);
      await client.query(
        'UPDATE tunes SET last_practiced_date = $1 WHERE id = ANY($2) AND user_id = $3',
        [date, tuneIds, userId]
      );
    }
    await client.query('COMMIT');
    return getSetById(id, userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function addTuneImage(tuneId, userId, filename, mimeType, data, checksum) {
  const { rows } = await pool.query(
    `INSERT INTO tune_images (tune_id, user_id, filename, mime_type, data, checksum)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tune_id, user_id, checksum) WHERE checksum IS NOT NULL DO NOTHING
     RETURNING id, filename, mime_type, created_at`,
    [tuneId, userId, filename, mimeType, data, checksum || null]
  );
  return rows[0] || null;
}

async function getTuneImageList(tuneId, userId) {
  const { rows } = await pool.query(
    `SELECT id, filename, mime_type, created_at
     FROM tune_images WHERE tune_id = $1 AND user_id = $2
     ORDER BY created_at ASC`,
    [tuneId, userId]
  );
  return rows;
}

async function getTuneImageData(imageId, tuneId, userId) {
  const { rows } = await pool.query(
    `SELECT filename, mime_type, data, created_at
     FROM tune_images WHERE id = $1 AND tune_id = $2 AND user_id = $3`,
    [imageId, tuneId, userId]
  );
  return rows[0] || null;
}

async function deleteTuneImage(imageId, tuneId, userId) {
  await pool.query(
    'DELETE FROM tune_images WHERE id = $1 AND tune_id = $2 AND user_id = $3',
    [imageId, tuneId, userId]
  );
}

// Returns a tune's own images plus images inherited from any set containing the tune.
// Each row includes `source` ('tune'|'set') and `source_id` for URL routing.
async function getTuneImagesAll(tuneId, userId) {
  const { rows } = await pool.query(
    `SELECT 'tune' AS source, id, tune_id AS source_id, filename, mime_type, created_at
     FROM tune_images
     WHERE tune_id = $1 AND user_id = $2
     UNION ALL
     SELECT 'set' AS source, si.id, si.set_id AS source_id, si.filename, si.mime_type, si.created_at
     FROM set_images si
     JOIN set_tunes st ON st.set_id = si.set_id
     WHERE st.tune_id = $1 AND si.user_id = $2
     ORDER BY created_at ASC`,
    [tuneId, userId]
  );
  return rows;
}

async function addSetImage(setId, userId, filename, mimeType, data, checksum) {
  const { rows } = await pool.query(
    `INSERT INTO set_images (set_id, user_id, filename, mime_type, data, checksum)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (set_id, user_id, checksum) WHERE checksum IS NOT NULL DO NOTHING
     RETURNING id, filename, mime_type, created_at`,
    [setId, userId, filename, mimeType, data, checksum || null]
  );
  return rows[0] || null;
}

async function getSetImageList(setId, userId) {
  const { rows } = await pool.query(
    `SELECT id, filename, mime_type, created_at
     FROM set_images WHERE set_id = $1 AND user_id = $2
     ORDER BY created_at ASC`,
    [setId, userId]
  );
  return rows;
}

async function getSetImageData(imageId, setId, userId) {
  const { rows } = await pool.query(
    `SELECT filename, mime_type, data, created_at
     FROM set_images WHERE id = $1 AND set_id = $2 AND user_id = $3`,
    [imageId, setId, userId]
  );
  return rows[0] || null;
}

async function deleteSetImage(imageId, setId, userId) {
  await pool.query(
    'DELETE FROM set_images WHERE id = $1 AND set_id = $2 AND user_id = $3',
    [imageId, setId, userId]
  );
}

// Higher rank wins when computing a tune's "best" status across instruments.
const STATUS_RANK = { 'Memorized': 2, 'Learning': 1, 'Not Learned': 0 };

// --- Per-instrument learning status (design/PerInstrumentStatus.md, Phase 2) ---

// Unified duplicate check for the user's collection. Used by POST/PUT routes
// (single tune) and mirrored in the CSV import path (in-memory). Returns
// `{ id, reason }` for the first matching existing tune, or null.
//
// Rules (consistent with the duplicate-checker UI):
//  - SID match: any non-empty Thesession ID match is a duplicate signal.
//  - Name match: case-insensitive name equality, AND types don't disagree
//    (any non-empty types must match), AND non-empty SIDs don't disagree.
//
// `excludeId` lets edits skip the tune being edited (otherwise it would
// collide with itself).
async function findTuneDup(userId, candidate, excludeId = null) {
  const sid = (candidate.sid || '').trim();
  const name = (candidate.name || '').trim();
  const type = (candidate.type || '').trim();

  if (sid) {
    const params = [userId, sid];
    let q = `SELECT id FROM tunes WHERE user_id = $1 AND trim(thesession_id) = $2`;
    if (excludeId) { q += ' AND id != $3'; params.push(excludeId); }
    q += ' LIMIT 1';
    const { rows } = await pool.query(q, params);
    if (rows[0]) return { id: rows[0].id, reason: `Thesession ID ${sid}` };
  }

  if (name) {
    const params = [userId, name.toLowerCase()];
    let q = `SELECT id, type, trim(thesession_id) AS sid FROM tunes
             WHERE user_id = $1 AND lower(trim(name)) = $2`;
    if (excludeId) { q += ' AND id != $3'; params.push(excludeId); }
    const { rows } = await pool.query(q, params);
    for (const r of rows) {
      const candType = (r.type || '').trim();
      const candSid = r.sid || '';
      if (type && candType && type !== candType) continue;
      if (sid && candSid && sid !== candSid) continue;
      return { id: r.id, reason: `name "${name}"` };
    }
  }

  return null;
}

async function getTuneInstrumentStatuses(tuneId, userId) {
  const { rows } = await pool.query(
    `SELECT tis.instrument, tis.status
     FROM tune_instrument_status tis
     JOIN tunes t ON t.id = tis.tune_id
     WHERE tis.tune_id = $1 AND t.user_id = $2
     ORDER BY tis.instrument`,
    [tuneId, userId]
  );
  return rows;
}

async function setTuneInstrumentStatus(tuneId, userId, instrument, status) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM tunes WHERE id = $1 AND user_id = $2`,
    [tuneId, userId]
  );
  if (rowCount === 0) return null;
  await pool.query(
    `INSERT INTO tune_instrument_status (tune_id, instrument, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (tune_id, instrument) DO UPDATE SET status = EXCLUDED.status`,
    [tuneId, instrument, status]
  );
  return getTuneInstrumentStatuses(tuneId, userId);
}

// Bulk-insert per-instrument rows after a CSV import. Skips conflicts so a
// re-import doesn't clobber per-instrument changes the user has made since.
// Runs in a single transaction.
async function bulkInsertTuneInstrumentStatuses(rows) {
  if (rows.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(
        `INSERT INTO tune_instrument_status (tune_id, instrument, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (tune_id, instrument) DO NOTHING`,
        [r.tune_id, r.instrument, r.status]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteTuneInstrumentStatus(tuneId, userId, instrument) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM tunes WHERE id = $1 AND user_id = $2`,
    [tuneId, userId]
  );
  if (rowCount === 0) return null;
  await pool.query(
    `DELETE FROM tune_instrument_status WHERE tune_id = $1 AND instrument = $2`,
    [tuneId, instrument]
  );
  return getTuneInstrumentStatuses(tuneId, userId);
}

// Reconciles per-instrument rows with the tune's instrument list (a
// comma-separated string from the form). Adds rows for newly-checked
// instruments and deletes rows for unchecked ones; existing rows keep their
// status. Newly-added instruments default to `defaultStatus` (callers pass
// the form's Learning Status field, or "Not Learned" if none provided).
async function syncTuneInstrumentRows(tuneId, userId, instrumentString, defaultStatus = 'Not Learned') {
  const instruments = (instrumentString || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const desired = new Set(instruments);

  const { rows: existingRows } = await pool.query(
    `SELECT instrument FROM tune_instrument_status WHERE tune_id = $1`,
    [tuneId]
  );
  const existing = new Set(existingRows.map(r => r.instrument));

  for (const inst of desired) {
    if (!existing.has(inst)) {
      await pool.query(
        `INSERT INTO tune_instrument_status (tune_id, instrument, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (tune_id, instrument) DO NOTHING`,
        [tuneId, inst, defaultStatus]
      );
    }
  }
  for (const inst of existing) {
    if (!desired.has(inst)) {
      await pool.query(
        `DELETE FROM tune_instrument_status WHERE tune_id = $1 AND instrument = $2`,
        [tuneId, inst]
      );
    }
  }
}

async function mergeTunes(primaryId, mergeIds, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const allIds = [primaryId, ...mergeIds];
    const { rows: tunes } = await client.query(
      'SELECT * FROM tunes WHERE id = ANY($1::int[]) AND user_id = $2',
      [allIds, userId]
    );
    if (tunes.length !== allIds.length) {
      await client.query('ROLLBACK');
      return null;
    }
    const totalCount = tunes.reduce((sum, t) => sum + (parseInt(t.count) || 0), 0);
    await client.query(
      'UPDATE tunes SET count = $1 WHERE id = $2 AND user_id = $3',
      [totalCount, primaryId, userId]
    );
    for (const mergeId of mergeIds) {
      const { rows: setRows } = await client.query(
        'SELECT set_id FROM set_tunes WHERE tune_id = $1',
        [mergeId]
      );
      for (const { set_id } of setRows) {
        const { rows: already } = await client.query(
          'SELECT id FROM set_tunes WHERE set_id = $1 AND tune_id = $2',
          [set_id, primaryId]
        );
        if (already.length === 0) {
          // Primary not yet in this set — redirect the row to point to primary
          await client.query(
            'UPDATE set_tunes SET tune_id = $1 WHERE set_id = $2 AND tune_id = $3',
            [primaryId, set_id, mergeId]
          );
        } else {
          // Primary already in set — just remove the duplicate
          await client.query(
            'DELETE FROM set_tunes WHERE set_id = $1 AND tune_id = $2',
            [set_id, mergeId]
          );
        }
      }
      await client.query('DELETE FROM tunes WHERE id = $1 AND user_id = $2', [mergeId, userId]);
    }
    await client.query('COMMIT');
    return getTuneById(primaryId, userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --- Classes / Series / Musicians (design/Classes.md, phase 2) -----------

// Fetches series, instructors, and optionally tunes for a set of class IDs
// in 2–3 batched queries. Returns [seriesById, instructorsByClass, tunesByClass?].
// tunesByClass is null when withTunes is false.
async function _batchEnrichClasses(classIds, withTunes) {
  // Series referenced by these classes.
  const seriesIds = [...new Set(
    (await pool.query('SELECT DISTINCT series_id FROM class WHERE id = ANY($1::int[]) AND series_id IS NOT NULL', [classIds]))
      .rows.map(r => r.series_id)
  )];
  const seriesById = new Map();
  if (seriesIds.length > 0) {
    const { rows } = await pool.query(
      'SELECT * FROM class_series WHERE id = ANY($1::int[])', [seriesIds]
    );
    for (const s of rows) seriesById.set(s.id, s);
  }

  // Instructors for all classes.
  const { rows: instrRows } = await pool.query(
    `SELECT ci.class_id, m.*
     FROM musician m
     JOIN class_instructors ci ON ci.musician_id = m.id
     WHERE ci.class_id = ANY($1::int[])
     ORDER BY m.name`,
    [classIds]
  );
  const instructorsByClass = new Map();
  for (const row of instrRows) {
    if (!instructorsByClass.has(row.class_id)) instructorsByClass.set(row.class_id, []);
    const { class_id, ...musician } = row;
    instructorsByClass.get(class_id).push(musician);
  }

  // Tunes for all classes (only when needed, e.g. CSV export).
  let tunesByClass = null;
  if (withTunes) {
    const { rows: tuneRows } = await pool.query(
      `SELECT ct.class_id, t.*
       FROM tunes t
       JOIN class_tunes ct ON ct.tune_id = t.id
       WHERE ct.class_id = ANY($1::int[])
       ORDER BY t.name`,
      [classIds]
    );
    tunesByClass = new Map();
    for (const row of tuneRows) {
      if (!tunesByClass.has(row.class_id)) tunesByClass.set(row.class_id, []);
      const { class_id, ...tune } = row;
      tunesByClass.get(class_id).push(tune);
    }
  }

  return [seriesById, instructorsByClass, tunesByClass];
}

// Loads a class's nested series, instructors (full musician rows), and
// tunes. Used by both the list and detail responses; the list version may
// pass `withTunes: false` if it doesn't need the M:N tune list.
async function _enrichClass(klass, withTunes = true) {
  if (!klass) return null;
  if (klass.series_id) {
    const { rows } = await pool.query('SELECT * FROM class_series WHERE id = $1', [klass.series_id]);
    klass.series = rows[0] || null;
  } else {
    klass.series = null;
  }
  const { rows: instrRows } = await pool.query(
    `SELECT m.* FROM musician m
     JOIN class_instructors ci ON ci.musician_id = m.id
     WHERE ci.class_id = $1
     ORDER BY m.name`,
    [klass.id]
  );
  klass.instructors = instrRows;
  if (withTunes) {
    const { rows: tuneRows } = await pool.query(
      `SELECT t.* FROM tunes t
       JOIN class_tunes ct ON ct.tune_id = t.id
       WHERE ct.class_id = $1
       ORDER BY t.name`,
      [klass.id]
    );
    klass.tunes = tuneRows;
  }
  return klass;
}

async function getClassesByUser(userId) {
  const { rows: classes } = await pool.query(
    'SELECT * FROM class WHERE user_id = $1 ORDER BY date DESC NULLS LAST, name',
    [userId]
  );
  if (classes.length === 0) return classes;
  const classIds = classes.map(c => c.id);

  const [seriesById, instructorsByClass] = await _batchEnrichClasses(classIds, false);

  return classes.map(c => ({
    ...c,
    series: seriesById.get(c.series_id) || null,
    instructors: instructorsByClass.get(c.id) || [],
  }));
}

async function getClassById(id, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM class WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return _enrichClass(rows[0]);
}

async function _syncClassTunes(client, classId, tuneIds) {
  await client.query('DELETE FROM class_tunes WHERE class_id = $1', [classId]);
  for (const tuneId of tuneIds || []) {
    await client.query(
      'INSERT INTO class_tunes (class_id, tune_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [classId, tuneId]
    );
  }
}

async function _syncClassInstructors(client, classId, musicianIds) {
  await client.query('DELETE FROM class_instructors WHERE class_id = $1', [classId]);
  for (const musicianId of musicianIds || []) {
    await client.query(
      'INSERT INTO class_instructors (class_id, musician_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [classId, musicianId]
    );
  }
}

// Creates a class plus its tune and instructor M:N rows in one transaction.
async function createClass(userId, data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO class (user_id, series_id, name, organizer, instrument, date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, data.series_id || null, data.name, data.organizer || null,
       data.instrument || null, data.date || null, data.notes || null]
    );
    const klass = rows[0];
    await _syncClassTunes(client, klass.id, data.tune_ids);
    await _syncClassInstructors(client, klass.id, data.instructor_ids);
    await client.query('COMMIT');
    return getClassById(klass.id, userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateClass(id, userId, data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE class SET series_id=$1, name=$2, organizer=$3, instrument=$4, date=$5, notes=$6
       WHERE id=$7 AND user_id=$8 RETURNING *`,
      [data.series_id || null, data.name, data.organizer || null,
       data.instrument || null, data.date || null, data.notes || null,
       id, userId]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return null; }
    if (data.tune_ids !== undefined) await _syncClassTunes(client, id, data.tune_ids);
    if (data.instructor_ids !== undefined) await _syncClassInstructors(client, id, data.instructor_ids);
    await client.query('COMMIT');
    return getClassById(id, userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteClass(id, userId) {
  await pool.query('DELETE FROM class WHERE id = $1 AND user_id = $2', [id, userId]);
}

// --- Class Series ---

async function getClassSeriesByUser(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM class_series WHERE user_id = $1 ORDER BY date_from DESC NULLS LAST, name',
    [userId]
  );
  return rows;
}

async function getClassSeriesById(id, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM class_series WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (!rows[0]) return null;
  // Attach the list of classes that belong to this series so the detail page
  // can render them without a second round-trip.
  const { rows: classes } = await pool.query(
    `SELECT * FROM class WHERE series_id = $1 AND user_id = $2
     ORDER BY date NULLS LAST, name`,
    [id, userId]
  );
  rows[0].classes = classes;
  return rows[0];
}

async function createClassSeries(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO class_series (user_id, name, organizer, instrument, date_from, date_to, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, data.name, data.organizer || null, data.instrument || null,
     data.date_from || null, data.date_to || null, data.notes || null]
  );
  return rows[0];
}

async function updateClassSeries(id, userId, data) {
  const { rows } = await pool.query(
    `UPDATE class_series SET name=$1, organizer=$2, instrument=$3, date_from=$4, date_to=$5, notes=$6
     WHERE id=$7 AND user_id=$8 RETURNING *`,
    [data.name, data.organizer || null, data.instrument || null,
     data.date_from || null, data.date_to || null, data.notes || null,
     id, userId]
  );
  return rows[0] || null;
}

async function deleteClassSeries(id, userId) {
  await pool.query('DELETE FROM class_series WHERE id = $1 AND user_id = $2', [id, userId]);
}

// --- Musicians ---

async function getMusiciansByUser(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM musician WHERE user_id = $1 ORDER BY name',
    [userId]
  );
  return rows;
}

async function getMusicianById(id, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM musician WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (!rows[0]) return null;
  // Attach the list of classes this musician taught (for the search-by-instructor
  // mechanism — answers the design's Q-D).
  const { rows: classes } = await pool.query(
    `SELECT c.* FROM class c
     JOIN class_instructors ci ON ci.class_id = c.id
     WHERE ci.musician_id = $1 AND c.user_id = $2
     ORDER BY c.date DESC NULLS LAST, c.name`,
    [id, userId]
  );
  rows[0].classes = classes;
  // Attach tunes this musician was listed as "Learned From" on.
  const { rows: tunesFrom } = await pool.query(
    `SELECT id, name, type FROM tunes
     WHERE who_musician_id = $1 AND user_id = $2
     ORDER BY name`,
    [id, userId]
  );
  rows[0].tunes_learned_from = tunesFrom;
  return rows[0];
}

async function createMusician(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO musician (user_id, name, instruments, website, notes, is_session_player)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, data.name, data.instruments || null, data.website || null, data.notes || null,
     data.is_session_player ? true : false]
  );
  const musician = rows[0];
  await pool.query(
    `UPDATE tunes SET who_musician_id = $1
     WHERE user_id = $2 AND who_musician_id IS NULL
       AND LOWER(TRIM(who)) = LOWER(TRIM($3))`,
    [musician.id, userId, musician.name]
  );
  return musician;
}

async function updateMusician(id, userId, data) {
  const { rows } = await pool.query(
    `UPDATE musician SET name=$1, instruments=$2, website=$3, notes=$4, is_session_player=$5
     WHERE id=$6 AND user_id=$7 RETURNING *`,
    [data.name, data.instruments || null, data.website || null, data.notes || null,
     data.is_session_player ? true : false, id, userId]
  );
  if (!rows[0]) return null;
  await pool.query(
    `UPDATE tunes SET who_musician_id = $1
     WHERE user_id = $2 AND who_musician_id IS NULL
       AND LOWER(TRIM(who)) = LOWER(TRIM($3))`,
    [rows[0].id, userId, rows[0].name]
  );
  return rows[0];
}

async function deleteMusician(id, userId) {
  await pool.query('DELETE FROM musician WHERE id = $1 AND user_id = $2', [id, userId]);
}

// --- Practice Log ---

async function getPracticeLog(tuneId, userId) {
  const { rows } = await pool.query(
    `SELECT pl.* FROM practice_log pl
     JOIN tunes t ON t.id = pl.tune_id
     WHERE pl.tune_id = $1 AND t.user_id = $2
     ORDER BY pl.date DESC, pl.created_at DESC`,
    [tuneId, userId]
  );
  return rows;
}

async function addPracticeLogEntry(tuneId, userId, { date, event_type, instrument, notes }) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM tunes WHERE id = $1 AND user_id = $2',
    [tuneId, userId]
  );
  if (rowCount === 0) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO practice_log (tune_id, user_id, date, event_type, instrument, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tuneId, userId, date, event_type, instrument, notes || null]
    );
    const entry = rows[0];

    // Keep last_practiced_date current (advance only if this entry's date is newer).
    await client.query(
      `UPDATE tunes SET last_practiced_date = $1
       WHERE id = $2 AND user_id = $3
         AND (last_practiced_date IS NULL OR last_practiced_date < $1)`,
      [date, tuneId, userId]
    );

    // Practice events: bump Not Learned → Learning for the played instrument.
    if (event_type === 'practice') {
      await client.query(
        `INSERT INTO tune_instrument_status (tune_id, instrument, status)
         VALUES ($1, $2, 'Learning')
         ON CONFLICT (tune_id, instrument)
         DO UPDATE SET status = 'Learning'
         WHERE tune_instrument_status.status = 'Not Learned'`,
        [tuneId, instrument]
      );
    }

    await client.query('COMMIT');
    return entry;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deletePracticeLogEntry(id, tuneId, userId) {
  await pool.query(
    `DELETE FROM practice_log
     WHERE id = $1 AND tune_id = $2
       AND tune_id IN (SELECT id FROM tunes WHERE user_id = $3)`,
    [id, tuneId, userId]
  );
}

module.exports = {
  init,
  getUserBySyncCode, createUser,
  getTunesByUser, getTuneById, createTune, updateTune, deleteTune, insertManyTunes,
  addTuneImage, getTuneImageList, getTuneImageData, deleteTuneImage, getTuneImagesAll,
  addSetImage, getSetImageList, getSetImageData, deleteSetImage,
  mergeTunes,
  findTuneDup,
  getTuneInstrumentStatuses, setTuneInstrumentStatus, deleteTuneInstrumentStatus,
  syncTuneInstrumentRows, bulkInsertTuneInstrumentStatuses,
  syncTuneClasses, findOrCreateClassByName, attachTuneToClass,
  findOrCreateSeriesByName, findOrCreateMusicianByName, getClassesWithDetails,
  getSetsByUser, getSetById, createSet, updateSet, deleteSet, patchSet, practiceSet,
  getClassesByUser, getClassById, createClass, updateClass, deleteClass,
  getClassSeriesByUser, getClassSeriesById, createClassSeries, updateClassSeries, deleteClassSeries,
  getMusiciansByUser, getMusicianById, createMusician, updateMusician, deleteMusician,
  getPracticeLog, addPracticeLogEntry, deletePracticeLogEntry,
};
