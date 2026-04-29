This is a list of items to be done.

* Add attributes to each of my entities. Ask my AI to "I've added basic attributes and descriptions for my entities. Without adding unnecessary complexity, can you think of important attributes I might be missing, given my app's purpose? Ask me clarifying questions, and suggest changes."
* Draw the relationships between my entities
* Activity: Think through the basic operations or actions in the domain, and write those down too.
* Practice log: track individual practice/play events (tune, date, type of event — practice vs. session play, optional notes). Show a history of events on the tune detail page and allow filtering/summary by date range.
* Musician entity: a person you play with or learn from. A musician can carry a "teacher" role, but the same person can appear as a teacher in a class and as a fellow player in a session. Replace the free-text "who" field on tunes with a reference to a musician. Fields to consider: name, instrument(s), notes, website/contact.
* Class entity: a learning event linking a teacher (musician), a location, a date, and one or more tunes taught (no limit on number of tunes). Location should support virtual places — Zoom counts as a location. When implemented, replace the Sequence ID field on tunes with a reference to a class. Note: the existing Sequence ID encodes class metadata in the format PREFIX-SERIES-NUMBER (e.g. DW1-3 = High D Whistle, series 1, class 3); this encoding should inform how class records are displayed or sorted but the structured fields (instrument, series, number) can replace the freeform string.

Already completed:
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
