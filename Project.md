# Session Buddy

A mobile-friendly Node.js web app for tracking Irish traditional music tunes and sets.

---

## Core Concepts

### Tunes
Tunes are the primary entity in the app. Each tune has the following fields:

| Field | Description |
|---|---|
| Name | Tune name. "The X" sorts as "X, The" but displays as "The X" |
| Type | Fixed list (see below) |
| Key | The key of the tune |
| Parts | Number of parts |
| Incipit A | Opening notes of the A part, in ABC notation |
| Incipit B | Opening notes of the B part, in ABC notation (optional) |
| Incipit C | Opening notes of the C part, in ABC notation (optional) |
| Learning Status | Not Learned / Learning / Memorized |
| Count | Number of times heard (used when not yet memorized) |
| Added Date | Date added to the list (hidden by default) |
| Where | Where the tune was learned (hidden by default) |
| Who | Who the tune was learned from |
| Mnemonic | A memory aid for the tune |
| Tunebooks | Which books the tune appears in |
| Date Learned | When the tune was learned (hidden by default) |
| Favorite | Whether the tune is a favorite |
| Thesession ID | Tune ID on thesession.org (hidden by default) |
| Setting | Setting number on thesession.org (hidden by default) |
| Notes | Free-form notes |
| Composer | Composer of the tune |
| Last Practiced Date | Date last practiced |

**Thesession.org link** is built from Tune ID and Setting:
- No setting: `https://thesession.org/tunes/{id}`
- With setting: `https://thesession.org/tunes/{id}#{setting}`

**Incipits** are displayed as both raw ABC notation text and rendered sheet music (using the abcjs library). Incipit B and C are only shown if they have a value.

**Hidden fields** (shown only when user taps "Show more"): Added Date, Where, Date Learned, Thesession ID, Setting ID, and any blank Incipit fields.

### Sets
A set is a named grouping of 2–3 tunes. A tune can belong to multiple sets.

Sets are created manually in the app by searching for and selecting tunes from the library, then ordering them.

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

### Tunes View
Lists all tunes sorted by:
1. Learning Status: Memorized → Learning → Not Learned
2. Within each group: alphabetically by name ("The X" sorts as "X, The", displays as "The X")

### Sets View
Lists all sets, each displayed as slash-separated tune names: `Tune1 / Tune2 / Tune3`

### Set Detail View
Shows each tune in the set with:
- Tune name (tappable to open full tune detail)
- All present incipits (A, and B/C if not blank), rendered as ABC text and sheet music

Designed for use during practice or live sessions as a quick reminder of how each tune starts.

### Tune Detail View
Shows all tune fields. Hidden fields are revealed with a "Show more" button.

---

## Data Entry

### CSV Import
Bulk import from a CSV file. Column mapping:

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
| Favorite | Favorite |
| Thesession ID | Thesession ID |
| Setting | Setting |
| Notes | Notes |
| Composer | Composer |
| Last Practiced Date | Last Practiced Date |

**Learning Status on import:** If the CSV has `X` in a dedicated learned column, import as Memorized. Otherwise default to Not Learned. "Learning" is set manually in the app.

### Manual Entry
Individual tunes and sets can be added manually through the app UI.

---

## Sync

Data syncs across devices using a **memorable sync code** (e.g. `fox-river-42`). The code is generated on first use and must be saved by the user. Entering the same code on another device accesses the same data.

---

## Tech Stack

- **Backend:** Node.js
- **Frontend:** Mobile-friendly web app
- **Music notation rendering:** [abcjs](https://www.abcjs.net/)
- **ABC notation standard:** [abcnotation.com](https://abcnotation.com/wiki/abc:standard:v2.1)
