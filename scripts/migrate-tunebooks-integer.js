// Converts tunes.tunebooks from TEXT to INTEGER.
// Existing values like "1,157" are coerced by stripping commas before casting.
// Safe to re-run: ALTER TYPE is a no-op if the column is already INTEGER.

require('dotenv').config();
const { Pool } = require('pg');

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'tunes' AND column_name = 'tunebooks'
    `);
    if (rows[0]?.data_type === 'integer') {
      console.log('tunebooks is already INTEGER — nothing to do.');
      return;
    }
    await pool.query(`
      ALTER TABLE tunes
        ALTER COLUMN tunebooks TYPE INTEGER
        USING CASE
          WHEN tunebooks IS NULL OR tunebooks = '' THEN NULL
          WHEN REPLACE(tunebooks, ',', '') ~ '^[0-9]+$' THEN REPLACE(tunebooks, ',', '')::INTEGER
          ELSE NULL
        END
    `);
    console.log('Done: tunebooks column converted to INTEGER.');
  } finally {
    await pool.end();
  }
}

migrate().catch(err => { console.error(err.message); process.exit(1); });
