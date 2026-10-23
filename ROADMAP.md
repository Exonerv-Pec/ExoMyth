# Exomyth roadmap

A living list of what Exomyth could do next. Nothing here is a promise; it is where we pick the next
piece of work from. Ideas from testers and contributors are welcome: open an issue.

| Mark | Meaning |
| --- | --- |
| ⬜ / 🚧 / ✅ | Not started / in progress / done |
| **S** / **M** / **L** | An evening / a few days / a big project |
| 💬 | Suggested by a tester |

Every feature keeps three rules: **private by design** (nothing leaves the device, no accounts or
servers), **plain files** (everything is readable Markdown, YAML or normal media files) and **clean
room** (our own code and words, nothing copied from other apps; see [CONTRIBUTING.md](CONTRIBUTING.md)).

Click a section to open it.

<details>
<summary><b>✅ Done</b> · 9 releases, latest 0.7.0 (2026-10-23)</summary>

<br>

| Version | Date | What came |
| --- | --- | --- |
| **0.7.0** | 2026-10-23 | 🕰️ Timeline; years of pages; one "Show by year" for the graph, cards, maps and timeline |
| **0.6.1** | 2026-10-23 | 🔒 Shared worlds can't imitate the app; safer publishing workflow |
| **0.6.0** | 2026-10-23 | 🗺️ Interactive maps with pins and years |
| **0.5.0** | 2026-10-23 | 🗂️ Cards view with folder tabs and page dossiers; page pictures |
| **0.4.0** | 2026-10-23 | 🖼️ Images, video and audio in pages |
| **0.3.0** | 2026-10-22 | ✨ The project is named Exomyth; the demo world lives in the repository |
| **0.2.1** | 2026-10-22 | 🌍 English demo world; deleting worlds stored in the browser |
| **0.2.0** | 2026-10-22 | 🕸️ Relations graph with a stable layout; page previews on hover |
| **0.1.0** | 2026-10-22 | 📝 Pages, `[[links]]`, typed relations in a stable panel, search, tags, safe rename |

💬 Tester ideas that are already in: a web version, a story bible / wiki, fast search across the
world, a timeline, art and music in pages, and separate worlds for separate stories.

Every change in detail: [CHANGELOG.md](CHANGELOG.md).

</details>

<details open>
<summary><b>🔜 Next: small and useful</b> · 9 ideas</summary>

<br>

| | Idea | Size | Notes |
| --- | --- | :---: | --- |
| ⬜ | Download a world as a .zip (and open one) | S | Backups, moving to another computer, sharing a world |
| ⬜ | Ask the browser to keep the world's storage | S | So the browser does not clear worlds when space runs low |
| ⬜ | Move a page to another folder | S | Today only renaming is possible |
| ⬜ | Quick ideas inbox 💬 | S | A button that adds a dated note to an `Inbox` page, to sort out later |
| ⬜ | Word count 💬 | S | For the page and the world, in the status bar; a first step towards writing stats |
| ⬜ | Spell check in the editor 💬 | S | The browser's own offline spell checker; the language follows the app |
| ⬜ | Focus mode | S | Hide the panels and centre the text, for writing without distractions |
| ⬜ | Quick look-up from anywhere 💬 | S | Search as an overlay in any view, with the preview card, to check lore without leaving the page |
| ⬜ | Page templates 💬 | M | "New page from template": Character, Place, Organization, Event, Scene. Templates are pages in a `Templates/` folder that anyone can edit |

</details>

<details>
<summary><b>📝 Writing tools</b> · 8 ideas</summary>

<br>

Exomyth started as a world wiki. These would make it a place to write the story too.

| | Idea | Size | Notes |
| --- | --- | :---: | --- |
| ⬜ | Manuscript: chapters and scenes in order | L | A `Manuscript/` folder with an order; read and export it as one text |
| ⬜ | Scene list / outline board | M | Scenes as cards with status, point of view, place and year; linked to the timeline |
| ⬜ | Story structure templates 💬 | M | Three acts, the hero's journey and other well-known shapes, in our own words, to plan a story or check a draft |
| ⬜ | Writing stats 💬 | M | Words per day, time spent writing, streaks; stored in the world, never sent anywhere |
| ⬜ | Dangerous drafting mode 💬 | M | An optional sprint: new text fades if you stop typing, until a goal is reached, then it goes to the draft. Never touches existing text |
| ⬜ | Mood boards and collages 💬 | M | Pictures, colours and quotes arranged freely for a character, place or scene |
| ⬜ | Editing workspace 💬 | L | Comments, revision notes, comparing versions |
| ⬜ | Dictionary / thesaurus 💬 | L | Must work offline, so the data has to ship with the app under a suitable licence |

</details>

<details>
<summary><b>🗺️ Worldbuilding</b> · 6 ideas</summary>

<br>

| | Idea | Size | Notes |
| --- | --- | :---: | --- |
| ⬜ | Playlists for a world or a scene 💬 | S | Audio already works in pages; a page of tracks that plays in order |
| ⬜ | Months, days, custom calendars and eras | M–L | Beyond whole years: "3rd of Frostmonth, Year 412 of the Second Age" |
| ⬜ | Map regions and layers | M | Shapes for countries and areas; layers for politics, terrain, routes |
| ⬜ | Family trees | M | Drawn from relations such as `father`, `mother`, `spouse` |
| ⬜ | Export a world as a static site | M | To share with players or readers, without the editor |
| ⬜ | Infinite whiteboard / canvas 💬 | L | Cards, images and notes placed freely, linked to pages |

</details>

<details>
<summary><b>💻 Platforms</b> · 5 ideas</summary>

<br>

| | Idea | Size | Notes |
| --- | --- | :---: | --- |
| ⬜ | Install as an app (PWA), fully offline | M | Works without a connection after the first visit; can be installed on phones |
| ⬜ | Mobile version 💬 | M–L | A layout made for phones first, installable from the browser; later perhaps a store app |
| ⬜ | Desktop app (Tauri) 💬 | L | Windows, macOS, Linux; no browser limits on folders |
| ⬜ | Sync between devices 💬 | L | Without a server of our own: through a folder the user already syncs (Syncthing, iCloud Drive, Dropbox, Git) |
| ⬜ | Voice notes to text 💬 | L | Needs an offline speech engine: the browser's built-in one sends audio to a server, which Exomyth must not do |

</details>

<details>
<summary><b>🧩 Workspace</b> · 2 ideas</summary>

<br>

| | Idea | Size | Notes |
| --- | --- | :---: | --- |
| ⬜ | Customizable workspace 💬 | M | Choose which views and panels to show, move them around, set your own shortcuts. Easy to change, never required |
| ⬜ | Project folders 💬 | M | A ready set of folders for a new story: brainstorming, outline, drafts, story bible, art, research, notes, playlist |

</details>

<details>
<summary><b>🤔 To think about</b> · 2 questions</summary>

<br>

- **Actions for AI agents and other tools** 💬. Worlds are plain files, so any tool can already read
  and write them. A documented format and a small command-line tool may be enough.
- **Projects and worlds** 💬. Today each world is a folder. Do writers want one project with several
  stories sharing a world, or one world per story?

Ideas stay on this list even when they look hard or far away: it is a place to remember them, and
the notes say what would have to be true for them to fit Exomyth's rules.

</details>
