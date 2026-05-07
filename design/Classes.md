# Classes — Design

Status: **draft, decisions resolved, follow-up questions outstanding**.

## Problem

Tunes are typically learned in classes (workshops, courses, retreats). Today, the only fields capturing this are `who` ("Learned From") and `where_learned`, both free-text. There's no way to:

- Group tunes that came out of the same class.
- Filter sets (or tunes) by class.
- Record class metadata (instructor, organizer, instrument, date) once and reference it from many tunes.
- Find every class taught by a particular instructor across the years.

The `Sequence ID` field (e.g. `DW1-3` = High D Whistle, Series 1, Class 3) tries to encode some of this as a string. Andy uses these IDs in external spreadsheets, so the field stays.

## Goals

1. First-class **Class** entity that one or more tunes can reference. A Class is a single event.
2. Optional **Class Series** entity for grouping classes (a 6-week OAIM whistle course = 1 series + 6 classes).
3. A **Musician** entity, used initially as the "instructor" of a class, with M:N to support multi-instructor classes.
4. Tunes ↔ Classes is M:N (a tune can belong to multiple classes).
5. Sets and Tunes are filterable by class.
6. Browsing a musician shows all classes they've taught.
7. Optionally record the **instrument** a class (or series) is taught on. Most classes are instrument-specific; some are tune-only (no instrument focus).
8. CSV import attaches new classes to existing tunes **without overwriting** their previous classes.
9. `tunes.sequence_id` stays as-is (Andy uses it for spreadsheet cross-reference).

## Non-goals (for now)

- Sharing classes / musicians between sync codes.
- Full Musician feature (the open TODO talks about replacing `tunes.who` with a musician ref, capturing session-player relationships, etc.). This design adds the entity, but only wires it up for the *instructor* role on classes. The broader Musician feature lands later.

## Proposed data model

```
class_series  (optional grouping)        class
──────────────────────                   ──────────────────────
id          SERIAL PK                    id            SERIAL PK
user_id     INTEGER FK → users           user_id       INTEGER FK → users
name        TEXT NOT NULL                series_id     INTEGER NULLABLE FK → class_series
organizer   TEXT (free-text)             name          TEXT NOT NULL
instrument  TEXT NULLABLE                organizer     TEXT (free-text)
date_from   DATE NULLABLE                instrument    TEXT NULLABLE
date_to     DATE NULLABLE                date          DATE NULLABLE
notes       TEXT                         notes         TEXT
created_at  TIMESTAMPTZ                  created_at    TIMESTAMPTZ

musician                                 class_tunes (M:N)
──────────────────────                   ──────────────────
id          SERIAL PK                    class_id      INTEGER FK → class
user_id     INTEGER FK → users           tune_id       INTEGER FK → tunes
name        TEXT NOT NULL                PRIMARY KEY (class_id, tune_id)
instruments TEXT (comma-sep, like tunes.instrument)
website     TEXT                         class_instructors (M:N)
notes       TEXT                         ──────────────────
created_at  TIMESTAMPTZ                  class_id      INTEGER FK → class
                                         musician_id   INTEGER FK → musician
                                         PRIMARY KEY (class_id, musician_id)
```

**Indexes** (per the existing FK-index pattern):
- `idx_class_user_id`, `idx_class_series_id`
- `idx_class_series_user_id`
- `idx_musician_user_id`
- `idx_class_tunes_class_id`, `idx_class_tunes_tune_id`
- `idx_class_instructors_class_id`, `idx_class_instructors_musician_id`

**Field notes**

- `class.name` is required, free-text. Examples: `"Class 3"`, `"OAIM Whistle Class 3"`, `"Kevin Crawford 2024 retreat workshop"`. Within a series the name might be terse ("Class 3"); standalone classes typically carry the full descriptive name.
- `class.series_id` is nullable — one-off workshops don't need a series.
- `class.organizer` is free-text, nullable. Stored on the class for self-containment. For classes in a series, the UI displays `class.organizer ?? series.organizer`. (See Q-A in Follow-up decisions.)
- `class.instrument` is nullable. Single value from the existing instrument list (Bb Whistle, C Whistle, Concertina, D Flute, Fiddle, High D Whistle, Low F Whistle). For classes in a series, the UI displays `class.instrument ?? series.instrument`. A null at both levels means "no instrument focus" (a tune-only class).
- `class_series.organizer` and `class_series.instrument` are the typical values for the whole series (OAIM, Swannanoa, O'Flaherty's Retreat); classes inherit them unless overridden at the class level.
- `musician.name` is required, free-text.
- `musician.instruments` reuses the comma-separated convention from `tunes.instrument` (a musician may play several).

## Migration of existing fields

| Current field        | Disposition                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `tunes.who`          | **Keep** as fallback ("Learned From") for non-class learning. Coexists with class associations. Eventually replaced by a Musician reference (open TODO). |
| `tunes.where_learned`| **Keep** as fallback for non-class learning.                                                                                  |
| `tunes.sequence_id`  | **Keep** as-is. Used for cross-reference with external spreadsheets.                                                          |

A tune can have **zero** classes (`who`/`where_learned` text only) or **many** classes.

## CSV import behavior change

Today's importer skips a row whose name or Thesession ID matches an existing tune. New rule:

1. New `Class` column in the tune CSV (case-insensitive lookup, like other columns). Value is a free-text class name; the importer does find-or-create against the user's `class` table.
2. If a CSV row matches an existing tune by name or SID and has a non-empty `Class`:
   - **Don't skip.** Find or create the Class by name for this user.
   - Attach the class to the existing tune (insert into `class_tunes` if not already present).
   - Don't modify other fields on the existing tune.
3. If the CSV row produces a new tune AND has a `Class`, attach the new tune to that Class.
4. The "Errors" CSV gains a column flagging rows that *only* added a class (so the user knows the row wasn't a no-op skip).

Auto-creating instructors / instruments via tune CSV is **not** in scope — too magic. New classes created from a CSV import have no instructors and no instrument until edited in the UI.

## UI surface

- A third bottom-nav tab **"Classes"** alongside Tunes / Sets.
- **Classes list**: shows classes grouped by series (collapsible series headers) plus standalone classes. Each card shows class name, organizer, instrument, date, and (if multi-instructor) primary instructor + " +N" indicator.
- **Class detail**: name (with `series.name` shown above it when in a series), organizer, instrument, date, instructors (chips that link to musician detail), attached tunes (links), edit, delete.
- **Series detail**: name, organizer, instrument, date range, list of classes in the series.
- **Tune form**: a "Classes" multi-select picker (similar UX to the set-builder).
- **Tune detail**: shows attached classes as tappable links.
- **Tune filter / Set filter**: new "Class" multi-select criterion.
- **Class form**: name, series picker (with quick-create), organizer, instrument picker (single-select, optional, drawn from the existing instrument list), date, instructors (typeahead with quick-create against `musician`), tune picker.
- **Musician handling**: managed inline via class form (typeahead + quick-create). No standalone Musicians tab.
- **Musician detail**: reachable by tapping an instructor chip on a class detail. Shows the musician's name, instruments, website, notes, and **the list of classes they've taught** — this is the search-by-instructor mechanism (answers Q-D). Edit and delete from here.

## Phasing

| Phase | Scope                                                                                              | Shippable? |
| ----- | -------------------------------------------------------------------------------------------------- | ---------- |
| 1     | Schema: `musician`, `class`, `class_series`, `class_tunes`, `class_instructors` tables + indexes.   | Yes        |
| 2     | Class CRUD UI: classes list, class/series detail, class form (with series quick-create + musician typeahead + instrument picker). Musician detail view (with the per-musician class list). Tune form gains classes picker. Tune detail shows classes. | Yes        |
| 3     | Tune filter and Set filter gain a "Class" criterion.                                               | Yes        |
| 4     | CSV import behavior: `Class` column with find-or-create.                                           | Yes        |

(Phase count dropped from 5 to 4 — the "Sequence ID retirement" phase in the previous draft is no longer needed since `tunes.sequence_id` stays.)

Each phase is its own commit and independently shippable.

## Resolved decisions

1. **Class as event vs course.** A class is a single event. A class series is a separate concept that contains multiple classes (e.g., a 6-week OAIM course = 1 `class_series` row + 6 `class` rows).
2. **Instructor representation.** Instructor is an entity (`musician` table), with M:N to class so a class can have multiple instructors. Many users take many classes from the same instructor — having an entity lets us "find all classes taught by Kevin Crawford."
3. **`where_learned` & `who`.** Keep both as fallbacks for tunes learned outside a class context.
4. **Sequence ID.** Keep `tunes.sequence_id` as-is; Andy uses it for external spreadsheet cross-reference. 
5. **CSV `Class` column format.** Free-text class name with find-or-create on import.
6. **Classes navigation tab.** Top-level, alongside Tunes / Sets.

## Follow-up decisions (raised by the answers above)

**Q-A. Where does `organizer` live?**
- Option 1: On Series only. Classes inherit. A one-off workshop must create a Series-of-1.
- Option 2: On Class only. Series has just name + dates. Denormalized when a series exists, but each class is self-contained.
- Option 3: On both, with class.organizer overriding series.organizer when present.

My lean: **Option 3** (the design above reflects this) — flexible without forcing a Series-of-1 for one-off workshops. Mild storage redundancy, no real downside.
Answer: Choose option 3

**Q-B. Naming the entity: `musician` or `instructor`?**
- The Specification glossary defines both Musician (a person who plays music) and Teacher (a musician who teaches). The open Musician TODO uses "Musician" with optional role flags.
- My lean: `musician`. Future expansion (a session-player relationship, replacing `tunes.who`) doesn't require renaming. The class M:N table is named `class_instructors` to make the role explicit at the relationship level.
Answer: musician

**Q-C. Class `name` for classes inside a series.**
- A class inside "OAIM Spring 2025 Whistle" — what should the class be called? `"Class 3"`? `"OAIM Spring 2025 Whistle — Class 3"`? `"2025-04-15"` (just the date)?
- My lean: free-text, user's choice. The Class detail header shows `series.name` above `class.name`, so terse names like "Class 3" or "2025-04-15" read fine in context.
Answer: Free text is fine, if series.name and class.name both show

**Q-D. Musician CRUD UI.**
- Inline-only (typeahead + quick-create from class form). No "Musicians" tab. Edits to a musician are done from a popover or via clicking the chip in class detail.
- Alternatively: a top-level "Musicians" tab once you start using them more.
- My lean: inline-only for now. Promote to a tab if/when you want to browse musicians across classes (e.g., "show me all classes taught by Kevin Crawford"). That browse view could live in musician *detail* without needing a tab.
Answer: inline-only. But I want to be able to search for classes taught by a particular instructor

**Q-E. Multi-instructor display.**
- A class with two instructors: how is this presented in the classes list (limited horizontal space)?
- My lean: show first instructor + " +1" indicator; full list in detail. Or just join with `&` if there are ≤2.
Answer: go with your lean. 95% of classes will only have one instructor, so a second instructor is a special case.

## Deferred: bulk-edit instrument on classes

Setting `instrument` on many classes at once isn't a built-in UI feature in the initial scope. Rationale:

1. **Series-level inheritance handles the common case.** A 6-week course where every class shares an instrument: set `series.instrument` once, all child classes inherit via `class.instrument ?? series.instrument`. No bulk operation needed.
2. **Ad-hoc cleanups can use SQL.** A one-time "set every class with this organizer to D Flute" is a single `UPDATE` statement against the database, run with the same backup-first pattern we used for the "X, The" rename pass. Doesn't need a UI.
3. **A bulk-edit UI is a small follow-up if (1) and (2) aren't enough.** Implementation would be: checkboxes on the classes list, an action bar showing "N selected" + "Set instrument…", and a `PATCH /api/classes/bulk` endpoint backed by a single `UPDATE class SET instrument = $1 WHERE id = ANY($2::int[]) AND user_id = $3`. Roughly half a day of work; can slot into Phase 2 if we end up wanting it.

The same logic applies if we ever want to bulk-edit other Class attributes (organizer, date, series). Build it once we feel the pain.
