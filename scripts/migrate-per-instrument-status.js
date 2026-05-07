// Phase 1 migration for design/PerInstrumentStatus.md.
//
// For every tune with a non-empty `instrument` field, insert one row into
// tune_instrument_status per instrument in the comma-separated list, copying
// the tune's current learning_status. Idempotent: ON CONFLICT DO NOTHING means
// re-running won't overwrite manually-changed per-instrument rows.
//
// Tunes whose `instrument` is empty are intentionally skipped — there's no
// instrument to attribute the status to. The user can add instruments later
// via the (Phase 2) tune detail.
//
// Run with --dry-run (default) to preview, or --apply to perform the migration.

require('dotenv').config();
const db = require('../db/database');
const { Pool } = require('pg');

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '=== APPLY MODE ===' : '=== DRY RUN (no changes will be made) ===');

  // Idempotently apply schema before migrating data.
  await db.init();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: existing } = await pool.query(
    `SELECT tune_id, instrument FROM tune_instrument_status`
  );
  const existingSet = new Set(existing.map(r => `${r.tune_id}|${r.instrument}`));

  const { rows: tunes } = await pool.query(`
    SELECT id, instrument, learning_status, user_id
    FROM tunes
    WHERE instrument IS NOT NULL AND trim(instrument) <> ''
  `);

  const toInsert = [];
  let alreadyPresent = 0;
  let tunesWithoutInstrument = 0;

  for (const tune of tunes) {
    const instruments = tune.instrument.split(',').map(s => s.trim()).filter(Boolean);
    if (instruments.length === 0) { tunesWithoutInstrument++; continue; }
    const status = tune.learning_status || 'Not Learned';
    for (const instrument of instruments) {
      const key = `${tune.id}|${instrument}`;
      if (existingSet.has(key)) {
        alreadyPresent++;
      } else {
        toInsert.push({ tune_id: tune.id, instrument, status });
        existingSet.add(key); // protects against duplicates within the same CSV-style list
      }
    }
  }

  // Also count tunes that have no instrument at all (informational).
  const { rows: blankRows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM tunes WHERE instrument IS NULL OR trim(instrument) = ''`
  );
  const tunesWithBlankInstrument = blankRows[0].c;

  console.log(`Tunes with at least one instrument: ${tunes.length}`);
  console.log(`Tunes with no instrument (skipped — status will live in legacy column until user adds instruments): ${tunesWithBlankInstrument}`);
  console.log(`Per-instrument rows already present: ${alreadyPresent}`);
  console.log(`Per-instrument rows ${apply ? 'inserted' : 'to insert'}: ${toInsert.length}`);

  if (toInsert.length > 0 && !apply) {
    console.log('\nFirst 10 rows that would be inserted:');
    for (const r of toInsert.slice(0, 10)) {
      console.log(`  tune_id=${r.tune_id} instrument="${r.instrument}" status="${r.status}"`);
    }
  }

  if (apply && toInsert.length > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of toInsert) {
        await client.query(
          `INSERT INTO tune_instrument_status (tune_id, instrument, status)
           VALUES ($1, $2, $3)
           ON CONFLICT (tune_id, instrument) DO NOTHING`,
          [r.tune_id, r.instrument, r.status]
        );
      }
      await client.query('COMMIT');
      console.log(`\nCommitted ${toInsert.length} rows.`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
