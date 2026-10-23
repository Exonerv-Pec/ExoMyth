# Exomyth roadmap

A living list of what Exomyth could do next. Nothing here is a promise; it is where we pick the next
piece of work from. Ideas from testers and contributors are welcome: open an issue.

**Size:** S = an evening, M = a few days, L = a big project. **Fit** says how well an idea matches
what Exomyth is: a private, offline-first wiki for worlds, kept as plain Markdown files.

Rules that every feature keeps:

- **Private by design.** Nothing leaves the device. No accounts, no servers, no tracking.
- **Plain files.** Everything a feature stores is readable Markdown, YAML or a normal media file.
- **Clean room.** Our own code and our own words; nothing copied from other apps (see CONTRIBUTING.md).

## ✅ Done

- Wiki pages, `[[links]]`, typed relations in a stable panel, tags, search, safe rename
- Relations graph with a stable layout; page previews on hover
- Cards view with folder tabs and page dossiers
- Images, video and audio in pages, also shown in Text mode
- Interactive maps with pins
- Timeline; years of pages; one "Show by year" for the graph, cards, maps and timeline
- Several worlds per browser or folder (each story can be its own world)

## 🔜 Next: small and useful

| Idea | Size | Notes |
| --- | --- | --- |
| Download a world as a .zip (and open one) | S | Backups, moving to another computer, sharing a world |
| Ask the browser to keep the world's storage | S | So the browser does not clear worlds when space runs low |
| Move a page to another folder | S | Today only renaming is possible |
| Page templates | M | "New page from template": Character, Place, Organization, Event, Scene. Templates are just pages in a `Templates/` folder that people can edit. *(tester)* |
| Quick ideas inbox | S | A button that adds a dated note to an `Inbox` page, to sort out later. *(tester: inspiration capture)* |
| Word count | S | For the page and the world, in the status bar. First step towards writing stats. *(tester)* |
| Spell check in the editor | S | Uses the browser's own offline spell checker; the language follows the page or the app. *(tester)* |
| Focus mode | S | Hide panels, centre the text, for writing without distractions |
| Quick look-up from anywhere | S | Search opens as an overlay in any view and shows the preview card, so lore can be checked without leaving the page. Search exists; this makes it reachable everywhere. *(tester)* |

## 📝 Writing tools

Exomyth started as a world wiki. These would make it a place to write the story too.

| Idea | Size | Fit | Notes |
| --- | --- | --- | --- |
| Manuscript: chapters and scenes in order | L | Good | A `Manuscript/` folder with an order; read and export it as one text |
| Scene list / outline board | M | Good | Scenes as cards with status, POV, place and year; links to the timeline |
| Story structure templates | M | Good | Three-act, the hero's journey and other well-known shapes, described in our own words, to plan a story or check a draft against. *(tester)* |
| Writing stats | M | Good | Words per day, time spent writing, streaks; stored in the world, never sent anywhere. *(tester: project analytics)* |
| Dangerous drafting mode | M | Fair | An optional sprint: text written during it fades if you stop typing, until a goal is reached, then it is saved to the draft. Never touches existing text. *(tester)* |
| Editing workspace | L | Fair | Comments, revision notes, compare versions. *(tester)* |
| Dictionary / thesaurus | L | Fair | Must work offline, so the data has to ship with the app under a suitable licence. *(tester)* |

## 🗺️ Worldbuilding

| Idea | Size | Notes |
| --- | --- | --- |
| Months, days, custom calendars and eras | M–L | Beyond whole years: "3rd of Frostmonth, Year 412 of the Second Age" |
| Map regions and layers | M | Shapes for countries and areas; layers for political, terrain, routes |
| Family trees | M | Drawn from relations such as `father`, `mother`, `spouse` |
| Infinite whiteboard / canvas | L | Cards, images and notes placed freely, linked to pages. *(tester)* |
| Playlists for a world or a scene | S | Audio already works in pages; a page of tracks that plays in order. *(tester)* |
| Export a world as a static site | M | To share with players or readers, without the editor |

## 💻 Platforms

| Idea | Size | Notes |
| --- | --- | --- |
| Install as an app (PWA), fully offline | M | Works without a connection after the first visit; can be installed on phones |
| Desktop app (Tauri) | L | Windows, macOS, Linux; no browser limits on folders. *(tester)* |
| Sync between devices | L | Without our own server: through a folder the user already syncs (Syncthing, iCloud Drive, Dropbox, Git). *(tester: mobile sync)* |
| Voice notes to text | L | Needs an offline speech engine: the browser's built-in one sends audio to a server, which Exomyth must not do. *(tester)* |

## 🤔 To think about

- **Actions for AI agents and other tools.** Worlds are plain files, so any tool can already read and
  write them. A documented format and a small command-line tool may be enough. *(tester)*
- **Projects and worlds.** Today each world is a folder. Do writers want one project with several
  stories sharing a world, or one world per story? *(tester: project manager)*
