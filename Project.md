# Session Buddy

A mobile-friendly Node.js web app for tracking Irish traditional music tunes and sets.

---

## Tech Stack

- **Runtime:** Node.js + Express
- **Database:** PostgreSQL (hosted on [Neon](https://neon.tech))
- **Deployment:** [Render](https://render.com)
- **Music notation rendering:** [abcjs](https://www.abcjs.net/) (loaded from CDN)
- **CSV parsing:** csv-parse
- **File uploads:** multer
- **Frontend:** Single-page app (SPA) — views are `<div>` elements shown/hidden with a `.active` CSS class; no framework

---

## Core Concepts

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
| Favorite | Whether the tune is a favorite (shown as ★) | No |
| Mnemonic | A memory aid for the tune | No |
| Who | Who the tune was learned from | No |
| Notes | Free-form notes | No |
| Composer | Composer of the tune | No |
| Tunebooks | Books the tune appears in | No |
| Instrument | Which instruments the tune is playable on (multiple allowed) | No |
| Sequence ID | ID grouping tunes from the same workshop/sequence (e.g. WK-2024-03) | No |
| Last Practiced Date | Date last practiced — has a "Today" button to set to current date | No |
| Count | Number of times heard | No |
| Added Date | Date added to the list | Yes |
| Where | Where the tune was learned | Yes |
| Date Learned | When the tune was learned | Yes |
| Thesession ID | Tune ID on thesession.org | Yes |
| Setting | Setting number on thesession.org | Yes |

**Thesession.org link** is built from Tune ID and Setting:
- No setting: `https://thesession.org/tunes/{id}`
- With setting: `https://thesession.org/tunes/{id}#{setting}`

**Incipits** are shown as both raw ABC notation text and rendered sheet music. The ABC header (meter, key) is derived automatically from the tune's Type and Key fields. Incipit B and C are only shown if they have a value.

**Instrument** values are stored as a comma-separated string. The UI presents them as a checkbox grid with these options: Bb Whistle, C Whistle, Concertina, D Flute, D Generic, Fiddle, High D Whistle, Low F Whistle.

### Sets
A set is an ordered grouping of 2–3 tunes. A tune can belong to multiple sets. Sets are displayed as slash-separated tune names: `Tune1 / Tune2 / Tune3`.

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
Shown on first load. User can start a new collection (generates a sync code) or enter an existing code to join a collection on another device.

### Tunes View
Lists all tunes grouped by learning status (Memorized → Learning → Not Learned), then alphabetically within each group. Each card shows the tune name, type/key, and a tappable status badge. Tapping the status badge cycles the status (Not Learned → Learning → Memorized → Not Learned) without opening the full detail. A search bar filters the list by name, type, or key.

### Tune Detail View
Shows all tune fields. "Show more" reveals hidden fields. Incipits render as sheet music. Has Edit and Delete buttons.

### Tune Form (Add / Edit)
Full form for entering or editing a tune. Navigating away after saving goes to the refreshed Tunes list (for an edit) or the new tune's detail view (for a new tune).

### Sets View
Lists all sets as `Tune1 / Tune2 / Tune3`. Tapping a set opens its detail.

### Set Detail View
Shows each tune in the set with its name (tappable to open the full tune detail) and all present incipits rendered as sheet music. Intended for quick reference during practice or a live session.

### Set Form (Build / Edit a Set)
Allows building or editing a set by selecting 2–3 tunes. The selected tunes are shown at the top with up/down buttons to reorder them. The Save button appears just above the search box (not at the bottom of the page). Navigating away after saving goes to the refreshed Sets list (for an edit) or the new set's detail view (for a new set).

### CSV Import View
Upload a CSV to bulk-import tunes. New tunes are added to the existing collection.

---

## Data Entry

### CSV Import
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

### Manual Entry
Individual tunes and sets can be added or edited through the app UI.

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
