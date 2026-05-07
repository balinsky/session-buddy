# Per-Instrument Learning Status — Design

Status: **draft, all decisions resolved**.

## Problem

A tune's learning status is currently a single value (`Not Learned` / `Learning` / `Memorized`) stored on the tune row. But the same tune can be at different stages on different instruments — memorized on flute, still learning on concertina, never tried on fiddle.

## Goal

Track learning status per `(tune, instrument)` pair, so the user can see and filter by what they've learned on each instrument.

## Non-goals

- Per-musician status. The whole app is per-user (one sync code per collection), so this isn't an issue.
- Tracking practice events per instrument. The Practice Log is a separate open TODO.

## Proposed data model

```
tune_instrument_status
──────────────────────
tune_id     INTEGER FK → tunes (ON DELETE CASCADE)
instrument  TEXT NOT NULL
status      TEXT NOT NULL DEFAULT 'Not Learned'
PRIMARY KEY (tune_id, instrument)
```

- One row per `(tune, instrument)` the user wants to track.
- Allowed `instrument` values match the existing list: Bb Whistle, C Whistle, Concertina, D Flute, D Generic, Fiddle, High D Whistle, Low F Whistle.
- The current `tunes.learning_status` and `tunes.instrument` columns are dropped after migration completes (per resolved decision 1: collapse).

## Relationship to existing `tunes.instrument`

Today, `tunes.instrument` is a comma-separated string listing which instruments the tune is *playable on*. After this change, the set of instruments in `tune_instrument_status` for a tune *is* the playable list. The `tunes.instrument` column gets dropped; per-instrument-status is the single source of truth.

## Migration

For each existing tune:

1. If `tunes.instrument` is set, INSERT a `tune_instrument_status` row for each instrument in the list, with `status = tunes.learning_status`.
2. If `tunes.instrument` is empty, leave the tune with no per-instrument rows (treated as "not yet tracked on any instrument"). The user can add instruments later via the tune detail.
3. After data has moved, drop `tunes.learning_status` and `tunes.instrument`.

A migration script lives in `scripts/migrate-per-instrument-status.js`. Idempotent — safe to re-run.

## UI changes

### Tune detail
Replace the single status segmented control with a per-instrument table:

```
Instrument         Status
─────────────────  ─────────────
D Flute            [Memorized]   ← tappable to cycle
Concertina         [Learning]
Fiddle             [Not Learned]
                   [+ Add instrument]
```

Tap a status to cycle (`Not Learned → Learning → Memorized → Not Learned`). "+ Add instrument" appends a new row (which adds the instrument to the tune's tracked set, status defaults to "Not Learned").

### Tune list / set list cards
Card shows the **best** status across instruments (a tune memorized on any instrument shows "Memorized"). A small `•••` icon appears when statuses differ across instruments, signaling there's more detail in the tune.

### Tune list status-badge tap
- **Single-instrument tunes**: tap cycles status (current behavior).
- **Multi-instrument tunes**: tap opens the tune detail (so the user can see and choose which instrument to update).

### Filter panel
- "Learning Status" multi-select stays.
- "Instrument" multi-select stays.
- New combined semantics: `Memorized + Flute` means **memorized on flute specifically**, not "memorized somewhere AND playable on flute". This is a behavior change worth noting in release notes.

### CSV import
Per-instrument columns. The single `Learned` column is kept as a backward-compat fallback so existing spreadsheets continue to import.

- New columns, one per instrument (case-insensitive): e.g. `Learned (D Flute)`, `Learned (Concertina)`, …
- Values use the existing `Learned` semantics: `X` = Memorized, `L` = Learning, anything else = Not Learned.
- If the CSV has any per-instrument columns, they're authoritative. The single `Learned` column is ignored.
- If the CSV has only the legacy `Learned` column, its value is copied to every instrument the tune is marked playable on (same as the migration logic). This preserves the current import behavior for old CSVs.

## Phasing

| Phase | Scope                                                                                                           | Shippable? |
| ----- | --------------------------------------------------------------------------------------------------------------- | ---------- |
| 1     | Schema: new table + migration script. UI keeps reading `tunes.learning_status` as a fallback for now.            | Yes        |
| 2     | Tune detail: per-instrument table replaces single status. `tune_instrument_status` becomes authoritative.        | Yes        |
| 3     | List/card badge: best-of summary + multi-instrument indicator.                                                  | Yes        |
| 4     | Filter panel: cross-criterion semantics.                                                                         | Yes        |
| 5     | CSV import gains per-instrument columns; legacy `Learned` column kept as fallback.                               | Yes        |
| 6     | Drop `tunes.learning_status` and `tunes.instrument` columns. Migration completed.                                | Yes        |

Phase 1 keeps both old columns alongside the new table — UI keeps working unchanged. Phase 6 finally removes them once everything reads from the new model.

## Resolved decisions

1. **Collapse `tunes.instrument` into the new table.** Yes — single source of truth.
2. **List card summary.** Best-of summary across instruments, with a small indicator when statuses differ.
3. **Inline status-badge tap on multi-instrument tunes.** Tap opens the tune detail.
4. **Filter combination semantics.** `Memorized + Flute` means "memorized on flute specifically" (behavior change confirmed).
5. **CSV `Learned` column.** Expand to per-instrument columns; keep the legacy single `Learned` column as a fallback so existing CSVs continue to import unchanged.

## Follow-up decisions

**Q-A. Per-instrument CSV column-name format.**
Three plausible conventions:

- (i) `Learned (D Flute)`, `Learned (Concertina)`, … — parenthetical suffix.
- (ii) `Learned D Flute`, `Learned Concertina`, … — space-separated.
- (iii) `Learned: D Flute`, `Learned: Concertina`, … — colon separator.

My lean: **(i) parenthetical suffix**. Visually clear in a spreadsheet header row, no ambiguity if an instrument name ever contains spaces (most do).
Answer: parentheses is fine.

**Q-B. CSV `Learned` value vocabulary.**
Today, `X` means Memorized; everything else means Not Learned. There's no way to express "Learning" in CSV. Options for the new per-instrument columns:

- (i) Single letters: `M` / `L` / `N` (or blank for Not Learned).
- (ii) `X` / `L` / blank (matches existing `X = Memorized` precedent; adds `L`).
- (iii) Full words: `Memorized` / `Learning` / `Not Learned`.

My lean: **(ii)** — backward-compatible feel; `X` keeps meaning Memorized; `L` adds Learning; blank stays Not Learned.
Answer: ii is fine.
