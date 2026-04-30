// Seed script — populates the local database with test data.
// Usage: node scripts/seed.js [--sync-code swift-glen-42]
// Defaults to sync code: test-data-01
// Wipes all existing tunes and sets for that sync code before inserting.

require('dotenv').config();
const { Pool } = require('pg');

const SYNC_CODE = process.argv.includes('--sync-code')
  ? process.argv[process.argv.indexOf('--sync-code') + 1]
  : 'test-data-01';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TUNES = [
  // ── Memorized + Favorite ─────────────────────────────────────────────────
  {
    name: 'The Silver Spear',
    type: 'Reel', key: 'D', parts: '2',
    incipit_a: 'dA~A2 BAFA|dA~A2 BFEF|dA~A2 BAFA|BFEF E2FE',
    incipit_b: 'fa~a2 bafa|fa~a2 bfef|fa~a2 bafa|bfaf e2fe',
    learning_status: 'Memorized', favorite: 1,
    thesession_id: '263', count: 12,
    who: 'Brian Conway', where_learned: 'Workshop 2024',
    last_practiced_date: '2026-04-28',
    instrument: 'D Flute,C Whistle',
    mnemonic: 'Down-down, up-down pattern in A part',
    sequence_id: 'DW1',
  },
  {
    name: "Drowsy Maggie",
    type: 'Reel', key: 'Edor', parts: '2',
    incipit_a: 'EBBA B2EB|B2EB dBAF|EBBA B2EB|dBAF E2EF',
    incipit_b: 'BEED E2FG|~A3B AFdF|BEED E2FG|AFDF E2EF',
    learning_status: 'Memorized', favorite: 1,
    thesession_id: '1', count: 18,
    who: 'Session at O\'Donoghues',
    last_practiced_date: '2026-04-27',
    instrument: 'D Flute',
  },
  {
    name: 'The Kesh Jig',
    type: 'Jig', key: 'G', parts: '2',
    incipit_a: 'EFG GAB|ded cBA|EFG GAB|dBA AFD',
    incipit_b: 'ded ded|ded cBA|ded dcd|edc BAF',
    learning_status: 'Memorized', favorite: 1,
    thesession_id: '7', count: 22,
    last_practiced_date: '2026-04-25',
    instrument: 'D Flute,C Whistle,High D Whistle',
  },
  {
    name: "The Connaughtman's Rambles",
    type: 'Jig', key: 'D', parts: '2',
    incipit_a: 'fdd cAA|Bcd efe|dcd ABc|dAF GEF',
    incipit_b: 'fga gfe|fga agf|fga gfe|fdf e2f',
    learning_status: 'Memorized', favorite: 0,
    thesession_id: '1198', count: 9,
    who: 'Noel Hill',
    last_practiced_date: '2026-04-20',
    instrument: 'D Flute',
    sequence_id: 'NH1',
  },
  {
    name: 'Rakish Paddy',
    type: 'Reel', key: 'D', parts: '2',
    incipit_a: 'dcdA BAFA|dcdA BGAG|dcdA BAFA|BGAG E2FG',
    incipit_b: 'afef defe|afef d2ef|afef defe|dBAB c2de',
    learning_status: 'Memorized', favorite: 1,
    thesession_id: '107', count: 15,
    where_learned: "Session at Matt Molloy's",
    last_practiced_date: '2026-04-26',
    instrument: 'D Flute,C Whistle',
  },
  {
    name: 'The Morning Dew',
    type: 'Reel', key: 'D', parts: '2',
    incipit_a: 'DEGA BGAG|DEGA BGBd|DEGA BdcA|BGAF GFED',
    incipit_b: 'g2fg e2de|g2fg edBd|g2fg edcA|BGAF GFED',
    learning_status: 'Memorized', favorite: 0,
    thesession_id: '1232', count: 7,
    last_practiced_date: '2026-04-22',
    instrument: 'D Flute',
  },
  // ── Learning ─────────────────────────────────────────────────────────────
  {
    name: 'The Swallowtail Jig',
    type: 'Jig', key: 'Edor', parts: '2',
    incipit_a: 'edBd edBd|edBd BAFA|edBd edBd|BAFE D3A',
    incipit_b: 'BAFA BAFA|BAFA B2cd|eAFA eAFA|B2AF E3A',
    learning_status: 'Learning', favorite: 0,
    thesession_id: '4', count: 3,
    who: 'Cathal McConnell',
    instrument: 'C Whistle',
  },
  {
    name: 'The Lilting Banshee',
    type: 'Jig', key: 'G', parts: '3',
    incipit_a: 'G2B dBd|gdB GBd|g2b bag|agf gdB',
    incipit_b: 'gab aba|gab afd|gab aba|ged edB',
    incipit_c: 'dga bag|a2g fdf|gag fef|g2f g2B',
    learning_status: 'Learning', favorite: 0,
    thesession_id: '27', count: 4,
    mnemonic: 'Three parts — third is the tricky one, slow it down',
    instrument: 'D Flute,C Whistle',
  },
  {
    name: 'Out on the Ocean',
    type: 'Reel', key: 'Ador', parts: '2',
    incipit_a: 'cAAG A2ea|agef gedB|cAAG A2ea|aged c2BA',
    incipit_b: 'eaag aefd|eaag aged|cA~A2 cdef|ged^c d2dB',
    learning_status: 'Learning', favorite: 0,
    thesession_id: '90', count: 2,
    where_learned: 'Monday session',
    instrument: 'D Flute',
  },
  {
    name: 'Farewell to Erin',
    type: 'Slip Jig', key: 'Edor', parts: '2',
    incipit_a: 'B2E EFG|B2E EFG|B2E Bcd|eag fag',
    incipit_b: 'ede efg|eag fge|def efg|afd B3',
    learning_status: 'Learning', favorite: 0,
    thesession_id: '1120', count: 1,
    instrument: 'High D Whistle',
    mnemonic: '9/8 — feel the lilt, dont rush',
  },
  {
    name: 'The Walls of Liscarroll',
    type: 'Jig', key: 'Edor', parts: '2',
    incipit_a: 'B2E EFG|~A3 AFD|B2E EFG|dBf d2e',
    incipit_b: 'fef efg|~a3 afg|fef efg|afg e3',
    learning_status: 'Learning', favorite: 0,
    thesession_id: '2090', count: 2,
    who: 'Noel Hill',
    sequence_id: 'NH1',
    instrument: 'C Whistle',
  },
  // ── Not Learned ──────────────────────────────────────────────────────────
  {
    name: 'The Fermoy Lasses',
    type: 'Reel', key: 'G', parts: '2',
    incipit_a: 'GFGA BGAG|GFGA Bdd2|GFGA BGBd|eaag a2gf',
    incipit_b: 'egdg egdg|egdg e2fg|agfe dgfe|d2de f2ge',
    learning_status: 'Not Learned', favorite: 0,
    thesession_id: '172', count: 0,
  },
  {
    name: 'The Gravel Walk',
    type: 'Reel', key: 'G', parts: '2',
    incipit_a: 'DGGF G2Bc|dBcA BGBd|g2fg bgag|fdef g2fg',
    incipit_b: 'bggf g2fg|agfe d2GA|BddB d2GA|Bdeg f2ef',
    learning_status: 'Not Learned', favorite: 0,
    thesession_id: '226', count: 0,
  },
  {
    name: "Jackson's Hornpipe",
    type: 'Hornpipe', key: 'D', parts: '2',
    incipit_a: 'AFDF AFDF|AFFE FGAB|AFDF AFDf|efge d2cB',
    incipit_b: 'dfaf dfaf|dfec d2fe|dfaf dfaf|ecAF D2cB',
    learning_status: 'Not Learned', favorite: 0,
    thesession_id: '65', count: 0,
  },
  {
    name: 'The Star Above the Garter',
    type: 'Jig', key: 'Edor', parts: '2',
    incipit_a: 'BEFA Bfed|BdcA BFAF|BEFA Bfed|cAFG AFED',
    incipit_b: 'dfbf afbf|dfbf a2ef|dfbf afbf|afeg fedc',
    learning_status: 'Not Learned', favorite: 0,
    thesession_id: '149', count: 0,
  },
  {
    name: 'The Congress Reel',
    type: 'Reel', key: 'D', parts: '2',
    incipit_a: 'd2cd AFDF|AFDF A2FA|d2cd AFDF|GBAG FDCF',
    incipit_b: 'd2cd AFDF|AFDF A2fg|afge fedf|edcB AGFE',
    learning_status: 'Not Learned', favorite: 0,
    thesession_id: '53', count: 0,
  },
  {
    name: 'St. Anne\'s Reel',
    type: 'Reel', key: 'D', parts: '2',
    incipit_a: 'dAAB d2ed|cAAB cAGE|dAAB d2ef|gfge dBAG',
    incipit_b: 'efga bgag|efga gede|efga bgaf|gfge dBAG',
    learning_status: 'Not Learned', favorite: 0,
    thesession_id: '3', count: 0,
  },
  {
    name: 'The Dusty Miller',
    type: 'Reel', key: 'Edor', parts: '2',
    incipit_a: 'BEED E2FG|AFDF AFGE|BEED E2FG|AFDF E4',
    incipit_b: 'Beef gfed|Beef g2ag|Beef gfed|cBAc B2EF',
    learning_status: 'Not Learned', favorite: 0,
    thesession_id: '50', count: 0,
  },
  // ── A polka for variety ──────────────────────────────────────────────────
  {
    name: 'The Ballyvourney Polka',
    type: 'Polka', key: 'D', parts: '2',
    incipit_a: 'ADFA dAFA|ADFD EFGE|ADFA dAFA|BFAF E2DE',
    learning_status: 'Not Learned', favorite: 0,
    count: 0,
  },
  // ── An air ──────────────────────────────────────────────────────────────
  {
    name: 'The Lonesome Boatman',
    type: 'Air', key: 'Edor', parts: '1',
    incipit_a: 'E3F GFED|EFGE B4|E3F GFED|EFGB A4',
    learning_status: 'Not Learned', favorite: 0,
    count: 0,
    notes: 'Beautiful tune, good for slow session openers',
  },
];

const SETS = [
  // set 0: Kesh + Connaughtman's
  { tuneNames: ['The Kesh Jig', "The Connaughtman's Rambles"], favorite: 1, last_practiced_date: '2026-04-25' },
  // set 1: Silver Spear + Rakish Paddy + Morning Dew
  { tuneNames: ['The Silver Spear', 'Rakish Paddy', 'The Morning Dew'], favorite: 1, last_practiced_date: '2026-04-28' },
  // set 2: Drowsy Maggie + Dusty Miller
  { tuneNames: ['Drowsy Maggie', 'The Dusty Miller'], favorite: 0, last_practiced_date: '2026-04-22' },
  // set 3: Swallowtail + Lilting Banshee + Walls of Liscarroll
  { tuneNames: ['The Swallowtail Jig', 'The Lilting Banshee', 'The Walls of Liscarroll'], favorite: 0, last_practiced_date: null },
  // set 4: Out on the Ocean + Fermoy Lasses + Gravel Walk
  { tuneNames: ['Out on the Ocean', 'The Fermoy Lasses', 'The Gravel Walk'], favorite: 0, last_practiced_date: null },
];

async function main() {
  console.log(`Seeding with sync code: ${SYNC_CODE}`);

  // Ensure tables exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      sync_code TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get or create user
  let { rows } = await pool.query('SELECT * FROM users WHERE sync_code = $1', [SYNC_CODE]);
  let user = rows[0];
  if (!user) {
    ({ rows } = await pool.query('INSERT INTO users (sync_code) VALUES ($1) RETURNING *', [SYNC_CODE]));
    user = rows[0];
    console.log(`Created user id=${user.id}`);
  } else {
    console.log(`Found existing user id=${user.id}`);
  }

  // Wipe existing data for this user
  await pool.query('DELETE FROM sets WHERE user_id = $1', [user.id]);
  await pool.query('DELETE FROM tunes WHERE user_id = $1', [user.id]);
  console.log('Cleared existing tunes and sets.');

  // Insert tunes
  const tuneMap = {};
  for (const tune of TUNES) {
    const { rows } = await pool.query(`
      INSERT INTO tunes (
        user_id, name, type, key, parts,
        incipit_a, incipit_b, incipit_c,
        learning_status, count, where_learned, who,
        mnemonic, tunebooks, date_learned, favorite,
        thesession_id, setting, notes, composer, last_practiced_date,
        instrument, sequence_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING id`,
      [
        user.id, tune.name, tune.type || null, tune.key || null, tune.parts || null,
        tune.incipit_a || null, tune.incipit_b || null, tune.incipit_c || null,
        tune.learning_status || 'Not Learned', tune.count || 0,
        tune.where_learned || null, tune.who || null,
        tune.mnemonic || null, tune.tunebooks || null, tune.date_learned || null,
        tune.favorite ? 1 : 0,
        tune.thesession_id || null, tune.setting || null,
        tune.notes || null, tune.composer || null, tune.last_practiced_date || null,
        tune.instrument || null, tune.sequence_id || null,
      ]
    );
    tuneMap[tune.name] = rows[0].id;
    console.log(`  Inserted tune: ${tune.name}`);
  }

  // Insert sets
  for (const setDef of SETS) {
    const tuneIds = setDef.tuneNames.map(n => {
      if (!tuneMap[n]) throw new Error(`Unknown tune name in set definition: ${n}`);
      return tuneMap[n];
    });

    const { rows } = await pool.query(
      'INSERT INTO sets (user_id, favorite, last_practiced_date) VALUES ($1,$2,$3) RETURNING id',
      [user.id, setDef.favorite ? 1 : 0, setDef.last_practiced_date || null]
    );
    const setId = rows[0].id;

    for (let i = 0; i < tuneIds.length; i++) {
      await pool.query(
        'INSERT INTO set_tunes (set_id, tune_id, position) VALUES ($1,$2,$3)',
        [setId, tuneIds[i], i]
      );
    }
    console.log(`  Inserted set: ${setDef.tuneNames.join(' / ')}`);
  }

  console.log(`\nDone. ${TUNES.length} tunes, ${SETS.length} sets inserted.`);
  console.log(`Sync code: ${SYNC_CODE}`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
