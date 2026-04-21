const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'session-buddy.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_code TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tunes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS set_tunes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id INTEGER NOT NULL,
    tune_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE,
    FOREIGN KEY (tune_id) REFERENCES tunes(id) ON DELETE CASCADE
  );
`);

// --- Users ---

function getUserBySyncCode(syncCode) {
  return db.prepare('SELECT * FROM users WHERE sync_code = ?').get(syncCode);
}

function createUser(syncCode) {
  const result = db.prepare('INSERT INTO users (sync_code) VALUES (?)').run(syncCode);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

// --- Tunes ---

function getTunesByUser(userId) {
  return db.prepare('SELECT * FROM tunes WHERE user_id = ?').all(userId);
}

function getTuneById(id, userId) {
  return db.prepare('SELECT * FROM tunes WHERE id = ? AND user_id = ?').get(id, userId);
}

const TUNE_FIELDS = `
  name, type, key, parts, incipit_a, incipit_b, incipit_c,
  learning_status, count, added_date, where_learned, who, mnemonic,
  tunebooks, date_learned, favorite, thesession_id, setting, notes,
  composer, last_practiced_date
`;

function tuneValues(data) {
  return [
    data.name, data.type || null, data.key || null, data.parts || null,
    data.incipit_a || null, data.incipit_b || null, data.incipit_c || null,
    data.learning_status || 'Not Learned',
    parseInt(data.count) || 0,
    data.added_date || null, data.where_learned || null, data.who || null,
    data.mnemonic || null, data.tunebooks || null, data.date_learned || null,
    data.favorite ? 1 : 0,
    data.thesession_id || null, data.setting || null,
    data.notes || null, data.composer || null, data.last_practiced_date || null,
  ];
}

function createTune(userId, data) {
  const stmt = db.prepare(`
    INSERT INTO tunes (user_id, ${TUNE_FIELDS})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(userId, ...tuneValues(data));
  return getTuneById(result.lastInsertRowid, userId);
}

function updateTune(id, userId, data) {
  const stmt = db.prepare(`
    UPDATE tunes SET
      name = ?, type = ?, key = ?, parts = ?,
      incipit_a = ?, incipit_b = ?, incipit_c = ?,
      learning_status = ?, count = ?, added_date = ?,
      where_learned = ?, who = ?, mnemonic = ?, tunebooks = ?,
      date_learned = ?, favorite = ?, thesession_id = ?,
      setting = ?, notes = ?, composer = ?, last_practiced_date = ?
    WHERE id = ? AND user_id = ?
  `);
  stmt.run(...tuneValues(data), id, userId);
  return getTuneById(id, userId);
}

function deleteTune(id, userId) {
  db.prepare('DELETE FROM tunes WHERE id = ? AND user_id = ?').run(id, userId);
}

const insertManyTunes = db.transaction((userId, tunes) => {
  return tunes.map(tune => createTune(userId, tune));
});

// --- Sets ---

function getSetTunes(setId) {
  return db.prepare(`
    SELECT t.*, st.position
    FROM tunes t
    JOIN set_tunes st ON t.id = st.tune_id
    WHERE st.set_id = ?
    ORDER BY st.position
  `).all(setId);
}

function getSetsByUser(userId) {
  const sets = db.prepare('SELECT * FROM sets WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  return sets.map(set => ({ ...set, tunes: getSetTunes(set.id) }));
}

function getSetById(id, userId) {
  const set = db.prepare('SELECT * FROM sets WHERE id = ? AND user_id = ?').get(id, userId);
  if (!set) return null;
  return { ...set, tunes: getSetTunes(id) };
}

function createSet(userId, tuneIds) {
  const result = db.prepare('INSERT INTO sets (user_id) VALUES (?)').run(userId);
  const setId = result.lastInsertRowid;
  const insertTune = db.prepare('INSERT INTO set_tunes (set_id, tune_id, position) VALUES (?, ?, ?)');
  tuneIds.forEach((tuneId, i) => insertTune.run(setId, tuneId, i));
  return getSetById(setId, userId);
}

function updateSet(id, userId, tuneIds) {
  const existing = db.prepare('SELECT id FROM sets WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return null;
  db.prepare('DELETE FROM set_tunes WHERE set_id = ?').run(id);
  const insertTune = db.prepare('INSERT INTO set_tunes (set_id, tune_id, position) VALUES (?, ?, ?)');
  tuneIds.forEach((tuneId, i) => insertTune.run(id, tuneId, i));
  return getSetById(id, userId);
}

function deleteSet(id, userId) {
  db.prepare('DELETE FROM sets WHERE id = ? AND user_id = ?').run(id, userId);
}

module.exports = {
  getUserBySyncCode, createUser,
  getTunesByUser, getTuneById, createTune, updateTune, deleteTune, insertManyTunes,
  getSetsByUser, getSetById, createSet, updateSet, deleteSet,
};
