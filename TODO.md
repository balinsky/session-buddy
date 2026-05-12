This is a list of items to be done.
* OCR for sheet music and Irish ABC images (stretch goal — recognise notation in uploaded images so we can search/render them).

* Add attributes to each of my entities. Ask my AI to "I've added basic attributes and descriptions for my entities. Without adding unnecessary complexity, can you think of important attributes I might be missing, given my app's purpose? Ask me clarifying questions, and suggest changes."
* Draw the relationships between my entities
* Activity: Think through the basic operations or actions in the domain, and write those down too.
* Practice log: track individual practice/play events (tune, date, type of event — practice vs. session play, optional notes). Show a history of events on the tune detail page and allow filtering/summary by date range.
* Broader Musician feature: replace the free-text "who" field on tunes with a reference to a musician, capture session-player relationships (a musician can be a teacher in one context and a fellow player in another). Foundation for this lands with Classes Phase 1; the tunes.who replacement and session-player tracking are deferred until after Classes ships.

Code improvements (from code-improver review):
* Extract the shared `col()` CSV column-lookup helper into a single utility module (currently copy-pasted identically into routes/tunes.js, routes/sets.js, and routes/classes.js).
* Wrap createSet/updateSet in transactions — tune insertions happen one-by-one with no rollback protection if the server crashes mid-way.
* Replace alert() with toast notifications — showError() calls window.alert(), which blocks the UI and looks wrong on mobile. A self-dismissing toast is more polished.
* Move literal routes before :param routes in routes/tunes.js — defensive ordering to prevent future routing bugs (pattern already documented in routes/classes.js).
* Rename the shadowing STATUS_CYCLE inside renderTuneDetail — a local variable shadows the module-level constant with a different shape (object vs. array).
* Use crypto.randomInt instead of Math.random for sync code generation — one-line change, cryptographically secure.

Already completed:
* Classes feature: Class + Class Series + Musician entities, M:N tune↔class, set/tune filter by class, CSV import attaches classes to new and existing tunes. (design/Classes.md, 4-phase rollout, commits 6794347 → af6df8b.)
* Per-instrument learning status: tunes track Memorized/Learning/Not Learned per instrument. Tune detail shows a per-instrument table with cycle-on-tap and add/remove. List card shows best-of summary with a small indicator when statuses differ. Filter combination "Memorized + Flute" means "memorized on Flute specifically". CSV import gained "Learned (Instrument)" columns; legacy single Learned column kept as a fallback. (design/PerInstrumentStatus.md, 6-phase rollout, commits afc711a → 7d2405d.)
* Per-tune images: jpg, png, and PDF attachments. Bulk tarball upload matches files to tunes by Thesession ID embedded in the filename. Full-screen viewer with remove button.
* Unified duplicate detection: name match alone isn't enough — types and Thesession IDs must agree. Same rule applies to CSV import, the duplicate-checker UI, and the website's add-tune / edit-tune flows (which return 409 with conflictingTuneId so the form can offer to open the existing tune).
* Create an import function for sets. CSV columns Tune 1–5, each a thesession.org ID (optionally #setting). Unmatched rows produce a downloadable error CSV with a description of which tunes to add.
* The tune filter should also allow the Learned From field to be searchable, just like the Where learned field.
* When you go back from the Set Detail page, the Sets page should refresh. Currently, if you click the Favorite icon, when you click backwards, the change doesn't show. 
* In both the My Tunes list and the My Sets list, non-favorite tunes should have an empty heart icon. If you click that icon, then favorite should be set for that tune or that set. If you change the favorite status of a set, don't modify the favorite status of any of the tunes in it.
* The Search bar for tunes should also search on the "thesession ID" and the Sequence ID.
* On the sets page, it should say what type of tune the tunes are. If there is more than one type in the set, it should say "Mixed"
* On the My Tunes page, favorites should also use a red heart, like on the My Sets page.
* On the My Tunes page, display the A incipit. Don't give it a label, and only show as many notes as will fit on one line. 
* Sets can have anywhere from 1 to 8 tunes. 
* On the My Sets page, display the A incipit of the first tune. Don't give it a label, and only display as many notes as will fit on one line. Place it where it currently says the number of tunes in the set, and don't display the number of tunes in the set. That is obvious from the title.
* When you're looking at a tune page, there should be a button to say "Add to a set" which would create a new set with that tune as one item already added to the set, and then allow you to add other tunes with it.
* The Tunes and Sets footer should always be visible so you can choose to switch from any screen.
* The Tune Detail page should have a checkbox next to it that allows you to make it a Favorite without going into the Edit screen. It could be shaped like a heart that would be filled in red if it were a favoirite, and and empty heart if it were not.
* Sets should also have a favorite field that should operate just like the Favorite tunes.
* Favorite tunes and favorite sets should show at the top of each respective listing.
* There should be a Filter function that allows you to display only certain Tunes based on various characteristics, such as Favorite staus, Memorized status, key, instrument, Where, Tune type, practiced date.
* The filter function should also work similarly for sets, based on tune type, favorite status
* Sets should also have a practiced date that operates much like the tune practice date. When a set is practiced, all the tunes in it should have their practice dates updated to match it
* We need a duplicate checker for the existing database. If it finds 2 or more  duplicate tunes, it should have a merge button for each set of tunes that is duplicated and offer to merge them. If two tunes are merged, it should inherit the classes that both tunes are associated with. The count should be the sum of the two tunes. The learned status should be the highest status of the group. 
