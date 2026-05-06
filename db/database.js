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
      learning_status TEXT DEFAULT 'Not Learned',
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
  await pool.query(`ALTER TABLE tunes ADD COLUMN IF NOT EXISTS instrument TEXT`);
  await pool.query(`ALTER TABLE tunes ADD COLUMN IF NOT EXISTS sequence_id TEXT`);
  await pool.query(`ALTER TABLE sets ADD COLUMN IF NOT EXISTS favorite INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE sets ADD COLUMN IF NOT EXISTS last_practiced_date TEXT`);
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
  const { rows } = await pool.query('SELECT * FROM tunes WHERE user_id = $1', [userId]);
  return rows;
}

async function getTuneById(id, userId) {
  const { rows } = await pool.query(
    `SELECT t.*,
      EXISTS(SELECT 1 FROM tune_images WHERE tune_id = t.id) AS has_image
     FROM tunes t
     WHERE t.id = $1 AND t.user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

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
    data.learning_status || 'Not Learned',
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
    data.instrument || null,
    data.sequence_id || null,
  ];
}

async function createTune(userId, data) {
  const { rows } = await pool.query(`
    INSERT INTO tunes (
      user_id, name, type, key, parts,
      incipit_a, incipit_b, incipit_c,
      learning_status, count, added_date, where_learned, who,
      mnemonic, tunebooks, date_learned, favorite,
      thesession_id, setting, notes, composer, last_practiced_date,
      instrument, sequence_id
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
      learning_status=$8, count=$9, added_date=$10,
      where_learned=$11, who=$12, mnemonic=$13, tunebooks=$14,
      date_learned=$15, favorite=$16, thesession_id=$17,
      setting=$18, notes=$19, composer=$20, last_practiced_date=$21,
      instrument=$22, sequence_id=$23
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
          learning_status, count, added_date, where_learned, who,
          mnemonic, tunebooks, date_learned, favorite,
          thesession_id, setting, notes, composer, last_practiced_date,
          instrument, sequence_id
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
  return rows;
}

async function getSetsByUser(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM sets WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return Promise.all(rows.map(async set => ({
    ...set,
    tunes: await getSetTunes(set.id),
  })));
}

async function getSetById(id, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM sets WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (!rows[0]) return null;
  return { ...rows[0], tunes: await getSetTunes(id) };
}

async function createSet(userId, tuneIds) {
  const { rows } = await pool.query(
    'INSERT INTO sets (user_id) VALUES ($1) RETURNING *',
    [userId]
  );
  const setId = rows[0].id;
  for (let i = 0; i < tuneIds.length; i++) {
    await pool.query(
      'INSERT INTO set_tunes (set_id, tune_id, position) VALUES ($1, $2, $3)',
      [setId, tuneIds[i], i]
    );
  }
  return getSetById(setId, userId);
}

async function updateSet(id, userId, tuneIds) {
  const { rows } = await pool.query(
    'SELECT id FROM sets WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (!rows[0]) return null;
  await pool.query('DELETE FROM set_tunes WHERE set_id = $1', [id]);
  for (let i = 0; i < tuneIds.length; i++) {
    await pool.query(
      'INSERT INTO set_tunes (set_id, tune_id, position) VALUES ($1, $2, $3)',
      [id, tuneIds[i], i]
    );
  }
  return getSetById(id, userId);
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

async function addTuneImage(tuneId, userId, filename, mimeType, data) {
  const { rows } = await pool.query(
    `INSERT INTO tune_images (tune_id, user_id, filename, mime_type, data)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, filename, mime_type, created_at`,
    [tuneId, userId, filename, mimeType, data]
  );
  return rows[0];
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
    `SELECT filename, mime_type, data
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
    const STATUS_RANK = { 'Memorized': 2, 'Learning': 1, 'Not Learned': 0 };
    const bestStatus = tunes.reduce((best, t) => {
      return (STATUS_RANK[t.learning_status] || 0) > (STATUS_RANK[best] || 0)
        ? t.learning_status : best;
    }, tunes.find(t => t.id === primaryId).learning_status);
    const totalCount = tunes.reduce((sum, t) => sum + (parseInt(t.count) || 0), 0);
    await client.query(
      'UPDATE tunes SET count = $1, learning_status = $2 WHERE id = $3 AND user_id = $4',
      [totalCount, bestStatus, primaryId, userId]
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

module.exports = {
  init,
  getUserBySyncCode, createUser,
  getTunesByUser, getTuneById, createTune, updateTune, deleteTune, insertManyTunes,
  addTuneImage, getTuneImageList, getTuneImageData, deleteTuneImage,
  mergeTunes,
  getSetsByUser, getSetById, createSet, updateSet, deleteSet, patchSet, practiceSet,
};
