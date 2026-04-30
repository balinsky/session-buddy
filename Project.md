# Session Buddy

A mobile-friendly Node.js web app for tracking Irish traditional music tunes and sets.

---

## Tech Stack

- **Runtime:** Node.js + Express
- **Database:** PostgreSQL (hosted on [Railway](https://railway.app) or [Neon](https://neon.tech))
- **Deployment:** [Railway](https://railway.app)
- **Music notation rendering:** [abcjs](https://www.abcjs.net/) (loaded from CDN)
- **CSV parsing:** csv-parse
- **File uploads:** multer
- **Frontend:** Single-page app (SPA) — views are `<div>` elements shown/hidden with a `.active` CSS class; no framework

---

## Core Concepts

### Guidelines for the AI when working on this code
Keep a reasonable level of clear modularity in this application, and if you detect disorganized code or breaks in the modularity, suggest fixing it.

Right now, all my buttons are clear or green, and delete buttons are red, but I can imagine wanting to change them. Make sure that's easy and that all the buttons that do a similar function share the same style definition.


### Tunes
Tunes are the primary entity. Each tune has the following fields:

| Field | Description | Hidden by default |
|---|---|---|
| Name | Tune name. "The X" sorts as "X, The" but displays as "The X" | No |
| Type | Fixed list (see below) | No |
| Key | Key of the tune (e.g. D, Ador) | No |
| Parts | Number of parts | No |
| Incipit A | Opening notes of the A part, in ABC notation | No |
| Incipit B | Opening notes of the B part (optional) | Yes (if blank) |
| Incipit C | Opening notes of the C part (optional) | Yes (if blank) |
| Learning Status | Not Learned / Learning / Memorized | No |
| Favorite | Heart toggle on detail page; red heart (♥) shown in list | No |
| Mnemonic | A memory aid for the tune | No |
| Who | Who the tune was learned from | No |
| Notes | Free-form notes | No |
| Composer | Composer of the tune | No |
| Tunebooks | Books the tune appears in | No |
| Instrument | Which instruments the tune is playable on (multiple allowed) | No |
| Sequence ID | ID grouping tunes from the same workshop/sequence (e.g. DW1-3) | No |
| Last Practiced Date | Date last practiced — has a "Today" button to set to current date | No |
| Count | Number of times heard | No |
| Added Date | Date added to the list | Yes |
| Where | Where the tune was learned | Yes |
| Date Learned | When the tune was learned | Yes |
| Thesession ID | Tune ID on thesession.org | Yes (shown inline with link) |
| Setting | Setting number on thesession.org | Yes |

**Thesession.org link** is shown in the Details card. The Thesession ID is displayed right-justified on the same row as the link. The URL is built from Tune ID and Setting:
- No setting: `https://thesession.org/tunes/{id}`
- With setting: `https://thesession.org/tunes/{id}#{setting}`

**Incipits** are shown as both raw ABC notation text and rendered sheet music. The ABC header (meter, key) is derived automatically from the tune's Type and Key fields. Incipit B and C are only shown if they have a value.

**Instrument** values are stored as a comma-separated string. The UI presents them as a checkbox grid with these options: Bb Whistle, C Whistle, Concertina, D Flute, D Generic, Fiddle, High D Whistle, Low F Whistle.

### Sets
A set is an ordered grouping of 1–8 tunes. A tune can belong to multiple sets. Sets are displayed as slash-separated tune names: `Tune1 / Tune2 / Tune3`.

Each set also has:

| Field | Description |
|---|---|
| Favorite | Heart toggle on detail page; heart (♥) shown in list |
| Last Practiced Date | Date last practiced — "Today" button updates the set AND all its tunes |

---

## Tune Types (in display order)

1. Reel
2. Jig
3. Slip Jig
4. Hornpipe
5. Polka
6. Slide
7. Air
8. Barndance
9. Fling
10. Gavotte
11. Highland
12. Hop Jig
13. March
14. Mazurka
15. Ridee
16. Rond
17. Shetland
18. Strathspey
19. Waltz
20. 3/2 Tune
21. 7/8 Tune

---

## Views

### Welcome / Sync Code View
Shown on first load (no sync code stored). User can start a new collection (generates a sync code) or enter an existing code to access a collection on another device.

### Tunes View
Lists all tunes. Tunes are grouped and sorted as follows:
1. **Favorites** (all, sorted by status then name) — shown as a group at the top
2. **Memorized** (non-favorites, alphabetical)
3. **Learning** (non-favorites, alphabetical)
4. **Not Learned** (non-favorites, alphabetical)

Within each group, "The X" sorts as "X, The" but displays as "The X".

Each card shows the tune name, type/key, a tappable status badge, the A incipit rendered as a single line of sheet music, and the Count. The Count is displayed inline on the type/key/status row, right-justified, with a **−** button to its left and a **+** button to its right. Tapping +/− increments or decrements the count immediately (floor of 0); the change is saved via a PATCH call without re-rendering the full list. Tapping the status badge cycles the status (Not Learned → Learning → Memorized → Not Learned) without opening the detail view. Favorite tunes show a red heart (♥); tapping it toggles the favorite.

A search bar filters the list by name, type, key, Thesession ID, or Sequence ID. A **Filter** button opens a filter panel (turns green when a filter is active). A **+ Add Tune** button opens a blank tune form.

### Tune Detail View
Shows all tune fields. "Show more" reveals hidden fields. Incipits render as sheet music.

- **Heart button** (♥) in the title area — tapping toggles the favorite, red when active
- **Status control** — segmented button to change learning status
- **"+ Add Tune"** button — opens a blank tune form
- **"+ Add to Set"** button — opens the set builder with this tune pre-selected
- **Edit** and **Delete** buttons
- **Last Practiced** row with a **Today** button that sets the date to the current date
- **thesession.org** row shows the link on the left and the Thesession ID right-justified on the same line

### Tune Form (Add / Edit)
Full form for entering or editing a tune. After saving an edit, returns to the refreshed Tunes list. After creating a new tune, goes to the new tune's detail.

### Sets View
Lists all sets. Favorites appear at the top (with a "Favorites" group header), then non-favorite sets under a "Sets" group header. Each card shows the tune names, the tune type (pluralized, e.g. "Jigs"; "Mixed" if more than one type), a red heart (♥) if favorited, and the A incipit of each tune (one line per tune, if the tune has an A incipit).

A **Filter** button opens a filter panel (turns green when a filter is active).

### Set Detail View
Shows each tune in the set with its name (tappable → opens full tune detail) and the A incipit rendered as sheet music. Intended for quick reference during practice or a live session. Only the A incipit is shown; B and C incipits are omitted.

- **Heart button** (♥) in the title area — tapping toggles the favorite for the set
- **Last Practiced** row with a **Today** button — updates the set's date AND updates every tune in the set to the same date
- **"+ New Set"** button — opens a blank set builder
- **Edit Set** and **Delete** buttons

### Set Form (Build / Edit a Set)
Allows building or editing a set by selecting 1–8 tunes from the library. Layout (top to bottom):
1. **Selected tunes** — shows chosen tunes with up/down reorder buttons and a remove button
2. **Save Set** and **Cancel** buttons (near the top, above the search box, for easy access)
3. **Search box** — filters the tune picker by name, type, Thesession ID, or Sequence ID
4. **Tune picker** — tap a tune to add it; already-selected tunes are greyed out

After saving an edit, returns to the refreshed Sets list. After creating a new set, goes to the new set's detail.

### CSV Import View (Tunes)
Upload a CSV to bulk-import tunes. New tunes are added to the existing collection.

### CSV Import View (Sets)
Upload a CSV to bulk-import sets. Each row creates one set. Columns are `Tune 1` through `Tune 5`; each value must be the Thesession ID of a tune already in the collection (optionally with `#setting`, e.g. `12345#setting2`). Blank columns are ignored. Rows where any tune cannot be matched are skipped and returned as a downloadable error CSV with a description of which tunes need to be added first.

### Filter Panel (Tunes)
A bottom-sheet modal with the following criteria (any combination):
- Favorites only
- Learning Status (multi-select: Memorized, Learning, Not Learned)
- Tune Type (multi-select, all 21 types)
- Key (text, substring match)
- Instrument (multi-select, all 8 instrument options)
- Where Learned (text, substring match)
- Learned From (text, substring match)
- Last Practiced within the last N days

**Apply** runs the filter; **Clear All** resets it. The Filter button in the toolbar turns green when a filter is active.

### Filter Panel (Sets)
A bottom-sheet modal with:
- Favorites only
- Contains Tune Type (multi-select — shows sets that contain at least one tune of the selected type)

---

## Data Entry

### CSV Import (Tunes)
Column names are matched case-insensitively.

| CSV Column | App Field |
|---|---|
| Name | Name |
| Type | Type |
| Key | Key |
| Parts | Parts |
| Incipit A | Incipit A |
| Incipit B | Incipit B |
| Incipit C | Incipit C |
| Count | Count |
| Added | Added Date |
| Where | Where |
| Who | Who |
| Mnemonic | Mnemonic |
| Tunebooks | Tunebooks |
| Date Learned | Date Learned |
| Favorite | Favorite (X = favorite) |
| Learned | Learning Status (X = Memorized, anything else = Not Learned) |
| Thesession ID | Thesession ID |
| Setting | Setting |
| Notes | Notes |
| Composer | Composer |
| Last Practiced Date | Last Practiced Date |
| Instrument | Instrument |
| Sequence ID | Sequence ID |

**Learning Status on import:** `X` in the `Learned` column imports as Memorized; anything else imports as Not Learned. The "Learning" status can only be set manually in the app.

### CSV Import (Sets)
Column names are matched case-insensitively.

| CSV Column | Description |
|---|---|
| Tune 1 | Thesession ID of the first tune (e.g. `12345` or `12345#2`) |
| Tune 2 | Thesession ID of the second tune (optional) |
| Tune 3 | Thesession ID of the third tune (optional) |
| Tune 4 | Thesession ID of the fourth tune (optional) |
| Tune 5 | Thesession ID of the fifth tune (optional) |

Each tune value is matched against tunes already in the collection by Thesession ID (and setting if `#setting` is appended). Rows with any unmatched tune are skipped; a downloadable error CSV is provided listing the problem rows and which tunes to add.

### Manual Entry
Individual tunes and sets can be added or edited through the app UI.

---

## Navigation

The Tunes / Sets tab bar at the bottom is **always visible** on every screen except the welcome screen. The active tab is highlighted based on which section you are in (tunes, tune detail, tune form, and tune CSV import all highlight the Tunes tab; sets, set detail, set form, and set CSV import all highlight the Sets tab).

A back arrow (←) appears in the header on all detail and form views.

---

## Sync

Data syncs across devices using a **memorable sync code** (adjective-noun-number format, e.g. `swift-glen-42`). The code is generated on first use. Entering the same code on another device accesses the same data. The sync gear icon (⚙) in the header shows the current code and allows switching to a different one.

---

## ABC Notation Rendering

Incipits are stored as bare note sequences (e.g. `DEGA BGAG`). When rendering, a full ABC header is prepended:

```
X:1
T:
M:{meter derived from tune type}
L:1/8
K:{tune key}
{incipit notes}
```

Meter mapping by type:

| Meter | Types |
|---|---|
| M:C (common time) | Reel, Hornpipe, Air |
| M:6/8 | Jig, Ridee |
| M:12/8 | Slide |
| M:9/8 | Slip Jig, Hop Jig |
| M:2/4 | Polka |
| M:3/4 | Waltz, Mazurka |
| M:3/2 | 3/2 Tune |
| M:7/8 | 7/8 Tune |
| M:4/4 | March, Strathspey, Highland, Fling, Gavotte, Barndance, Rond, Shetland |

---

## Dev Tools

### Seed Script (`scripts/seed.js`)
Populates a local PostgreSQL database with 20 realistic tunes (mix of types, keys, learning statuses, incipits, instruments, and thesession IDs) and 5 sets. Wipes and re-inserts data for the target sync code on each run.

```
node scripts/seed.js                     # uses sync code: test-data-01
node scripts/seed.js --sync-code my-code # uses a custom sync code
```

Requires `DATABASE_URL` in `.env` pointing to a local PostgreSQL instance.
