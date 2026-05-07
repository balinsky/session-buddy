// One-shot script: find tune rows that share a Thesession ID AND whose names
// differ only by punctuation/accents/case, then merge them via db.mergeTunes.
//
// Run with --dry-run (default) to preview, or --apply to perform the merges.
// The primary tune in each group is the one with the lowest id.

require('dotenv').config();
const db = require('../db/database');

const TARGET_SYNC_CODES = ['proud-vale-15', 'green-plain-64'];

// Normalize a name to a comparison key. Two names producing the same key are
// treated as duplicates: identical after stripping case, accents, a leading
// "The "/"An "/"A " article, and every non-alphanumeric character.
function normName(name) {
  if (!name) return '';
  return name
    .normalize('NFD')                       // separate accents from base letters
    .replace(/[̀-ͯ]/g, '')        // strip combining marks
    .toLowerCase()
    .replace(/^(?:the|an|a)\s+/, '')        // drop leading article (must be space-followed)
    .replace(/[^a-z0-9]+/g, '');            // strip everything that isn't a letter or digit
}

async function findCandidates(userId) {
  const tunes = await db.getTunesByUser(userId);
  // Bucket by trimmed thesession_id (skip blanks)
  const bySid = new Map();
  for (const t of tunes) {
    const sid = (t.thesession_id || '').trim();
    if (!sid) continue;
    if (!bySid.has(sid)) bySid.set(sid, []);
    bySid.get(sid).push(t);
  }
  // Within each SID bucket, sub-bucket by normalized name. Keep sub-buckets of size > 1.
  const groups = [];
  for (const [sid, members] of bySid) {
    const byNorm = new Map();
    for (const t of members) {
      const k = normName(t.name);
      if (!k) continue;
      if (!byNorm.has(k)) byNorm.set(k, []);
      byNorm.get(k).push(t);
    }
    for (const [, sub] of byNorm) {
      if (sub.length > 1) {
        // Prefer the "The X" / "An X" / "A X" form as the primary so the kept
        // row uses the canonical article-in-front display. Lowest id breaks ties.
        sub.sort((a, b) => {
          const aHas = /^(the|an|a)\s+/i.test(a.name) ? 0 : 1;
          const bHas = /^(the|an|a)\s+/i.test(b.name) ? 0 : 1;
          return aHas - bHas || a.id - b.id;
        });
        groups.push({ sid, tunes: sub });
      }
    }
  }
  return groups;
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '=== APPLY MODE ===' : '=== DRY RUN (no changes will be made) ===');
  let totalGroups = 0;
  let totalMergedRows = 0;

  for (const sync of TARGET_SYNC_CODES) {
    const user = await db.getUserBySyncCode(sync);
    if (!user) { console.log(`[${sync}] user not found, skipping`); continue; }
    const groups = await findCandidates(user.id);
    console.log(`\n[${sync}] ${groups.length} merge groups found:`);
    for (const g of groups) {
      const primary = g.tunes[0];
      const others = g.tunes.slice(1);
      console.log(`  SID ${g.sid}: keep #${primary.id} "${primary.name}" ; merge #${others.map(t => `${t.id} "${t.name}"`).join(', #')}`);
      totalGroups++;
      totalMergedRows += others.length;
      if (apply) {
        const result = await db.mergeTunes(primary.id, others.map(t => t.id), user.id);
        if (!result) console.log(`    !! merge returned null (ownership mismatch?)`);
      }
    }
  }

  console.log(`\nTotal: ${totalGroups} groups, ${totalMergedRows} duplicate rows ${apply ? 'merged' : 'identified for merge'}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
