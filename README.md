# Exomyth

A private, offline-first wiki for writers and world builders. Your world is a folder of plain
Markdown files on your own device. No account, no server, no tracking.

> **Status: early alpha (v0.8).** Pages, typed relations, a stable relations panel, a relations
> graph with a stable layout, cards, a timeline, interactive maps with pins, moving through the
> years, images, video and audio, word count, quick notes, .zip backups, page previews on hover,
> search, tags, rename with link updates.
> [Русская версия](README.ru.md)

## Principles

- **Private by design.** The app makes no network requests (the page ships with a Content Security
  Policy that forbids them). Worlds live in a folder you choose, or in your browser's own storage.
- **Your files, your format.** Every page is a `.md` file with a small YAML header. You can open the
  folder in any editor, sync it with any tool, or put it in Git. If Exomyth disappears, nothing is lost.
- **Stable, findable relations.** Relations are shown in a fixed panel next to the page, always in the
  same order: by relation type, then alphabetically. The relations graph keeps every page where it
  was put: positions are saved in the world, new pages appear next to their neighbours, and nothing
  re-lays-out unless you ask.
- **Open source.** AGPL-3.0: free to use and modify; derivative works, including hosted services, must
  stay open under the same license. See [LICENSE-NOTE.md](LICENSE-NOTE.md).

## Try it

**Open the app: https://exonerv-pec.github.io/Exomyth/** — nothing to install. The site only delivers
the app to your browser; your worlds stay on your device.

### Run it yourself

Step-by-step guide: [BUILDING.md](BUILDING.md). In short, with Node.js 20+:

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + interface tests
npm run build      # static site in dist/
```

Open the app in **Chrome, Edge or Opera** to work directly on a folder of your computer. In other
browsers you can keep worlds in the browser's own storage.

A small sample world lives in [`examples/demo-world/`](examples/demo-world/): open that folder from
the app, or press "Open the demo world" on the welcome screen to get a copy in your browser. The
files are plain Markdown, so they also show what the file format looks like.

## File format

A page is a Markdown file. An optional YAML header at the top holds metadata and typed relations:

```markdown
---
aliases: [Kira, Silver Kira]
tags: [character, hero]
born: 412
relations:
  father: "[[Arn Vale]]"
  ally: ["[[Bo Tarn]]", "[[Order of the Silver River]]"]
  born in: "[[Rivertown]]"
pinned: ["[[Arn Vale]]"]
---
# Kira Vale

Daughter of [[Arn Vale|King Arn]]. Grew up in [[Rivertown]].

The secret: ||Eva Crow is her half-sister||.
```

| Element | Meaning |
| --- | --- |
| `[[Page]]`, `[[Page\|text]]`, `[[Page#Heading]]` | Link to a page (by name, alias or partial path), with optional text or heading |
| `relations:` | Typed relations. The key is the relation type; the value is one link or a list |
| `aliases:` | Other names that links can use |
| `image:` | Picture of the page (portrait, emblem, map), shown in its infobox and on its card |
| `map:`, `pins:` | Turns the page into an interactive map with pins (see Maps below) |
| `from:`/`to:`, `born:`/`died:`, `founded:`, `year:` | Years of the page, for the timeline and "Show by year" (see Timeline below) |
| `tags:` and `#tag` | Tags (header or inline) |
| `pinned:` | Links shown first in their group in the relations panel |
| `\|\|secret\|\|` | Spoiler, hidden in reading view until clicked |
| `{==passage==}{>>comment<<}`, `{++add++}`, `{--remove--}`, `{~~old~>new~~}` | Comments and suggested changes (CriticMarkup), see Editing below |
| `revision:` | Notes on what to fix on the page |
| `![[map.png]]`, `![[map.png\|400]]`, `![[intro.mp4]]`, `![[theme.mp3]]` | Image, video or audio file of the world (optional width, or a caption after `\|`) |
| other header fields | Shown as facts in the page's infobox |

Per-world settings live in `.exomyth/settings.json`:

```json
{
  "relationTypes": [
    { "id": "father", "inverse": "children" },
    { "id": "ally", "symmetric": true }
  ]
}
```

`relationTypes` sets the order of groups in the panel, the label for the reverse direction
(`inverse`), and whether a relation is the same from both sides (`symmetric`). Deleted pages are moved
to `.trash/` inside the world, never erased.

Graph positions are saved in `.exomyth/graph.json` (`[x, y, onShelf]` per page, plus a fixed colour
slot per folder). Delete that file to get a fresh layout, or use "Lay out again" in the graph.

Writing stats are saved in `.exomyth/writing.json`: one line per day with the words written and the
seconds spent, and the daily goal. It is plain JSON, so you can read it or delete it.

Saved versions of pages are plain copies in `.exomyth/versions/<page path>/<date time>[ name].md`.

## Relations graph

Switch to **Graph** in the top bar (or press the graph button in the relations panel).

- Every page is a circle, coloured by its top-level folder. Lines join related pages: darker for
  typed relations, lighter for plain mentions.
- Pages with no connections at all sit on a shelf under the graph, drawn hollow.
- Click selects a page (the relations panel follows), double-click opens it, drag moves it.
- Hover a page to highlight its neighbours and see the names of its relations.
- "Neighbours" and "Two steps away" show only the area around the selected page; positions stay
  the same, so the map does not change under you.

## Maps

Any page becomes a map when its header names a picture with `map:`. The reading view then shows an
interactive map: zoom with the wheel or a pinch, drag to move, and use "Full screen" for more room.

- **Pins** point to pages (a city, a fortress, a character) or just carry a label. Hover a pin for a
  preview of its page, click it to open the page. Pins have the colour of their page's folder.
- **Edit map**: click the map to place a pin, drag pins to move them, and set the selected pin's page,
  label, layer and years. Arrow keys move the selected pin; Delete removes it.
- **Areas**: in Edit map, "Draw an area" and click the corners of a country, a forest or a flooded
  plain; close it on the first corner, with Enter or "Done". An area can link to a page, have a label,
  a colour (or its page's folder colour) and years; drag its corners to reshape it.
- **Layers**: give pins and areas a layer (Politics, Terrain, History…) and switch layers on and off
  with **Layers** above the map. Things without a layer are always shown.
- **Years**: a pin can have `from` and `to` (both included). Switch on "Show by year" and move the
  slider to see the map as it was in that year.

Pins are stored in the page header as plain text; positions are fractions of the picture, so they stay
right if you replace the picture with a larger copy:

```yaml
map: silver coast.svg
pins:
  - page: "[[Rivertown]]"
    x: 0.52
    y: 0.62
    from: 300
  - label: Old Watchtower
    x: 0.3
    y: 0.27
    from: 210
    to: 405
    layer: History
regions:
  - label: Kingdom of the Vales
    layer: Politics
    color: "#a86214"
    from: 300
    points: [[0.19, 0.12], [0.53, 0.16], [0.7, 0.37], [0.76, 0.71], [0.38, 0.77], [0.16, 0.37]]
```

Pinned pages count as links: they appear in backlinks and on the graph.

## Cards

Switch to **Cards** in the top bar to browse the world as cards.

- **Folder tabs** (Characters, Places, Organizations...) show every page of a folder as a card with
  its picture or initials, folder colour and key facts.
- **Page dossier** shows the selected page as a large card, and below it every related page as a
  card, grouped by relation: for an organization, its leader, members, allies and the pages that
  mention it. Groups and cards come in the same fixed order as the relations panel.
- Click a card to open its dossier, double-click to open the page itself.

## Timeline

Switch to **Timeline** in the top bar to see who lived when and what happened. Every page with years
gets a row, grouped by folder: a bar from its first to its last year, a diamond for a one-year event,
and a bar that fades out for what is still going (a character who is alive, a city that still stands).

Give a page its years in the **Years** fields at the top of the relations panel, or write them in its
header with the words that fit the page:

```yaml
born: 412          # or from:, founded:, built:, established:
died: 455          # or to:, destroyed:, dissolved:, fell:
year: 430          # an event on one year
years: 429-430     # an event over several years
```

Only whole years count (`412`, `412 AE`, `-50`). Click a row to select the page, double-click to open it;
`Ctrl` + wheel zooms.

**Moving through the years.** Press on the years scale and drag, or switch on **Show by year** and use
the slider. The chosen year is shared by the whole world: the timeline draws a line at it, the graph
and cards fade the pages that did not exist yet (or any more), and maps hide their pins. A map pin
without years of its own follows the years of its page. Pages without years are always shown.

## Writing a book

Switch to **Book** to write the story itself. A book is an ordinary page with `manuscript: true` in its
header; its text is the table of contents: `##` headings are chapters, and list items with a link are
the scenes, in reading order. Notes and anything else on the page are kept as written.

```markdown
---
manuscript: true
---
# The Silver Thread

## Chapter 1: The River
- [[Arrival at Rivertown]]
- [[The Market]]
```

- **Board**: chapters as columns, scenes as cards with their status, point of view, year, summary and
  word count. Drag cards between chapters (or Alt+arrows), add a scene (made from the Scene template)
  or a chapter, rename and reorder chapters.
- **Read**: the whole book straight through, chapter by chapter.
- **Download (.md)**: the book as one Markdown file, links turned into plain words.
- On a scene's page, the relations panel shows where it is in the book, with **Previous / Next scene**
  and its status: Idea, Draft, Revised, Done (`status:` in the header, in English or Russian).

Scenes are ordinary pages, so their `year:` puts them on the timeline and `pov:` / `place:` relations
put them on the graph.

## Story projects

A ready set of folders for a new story. In the **New page** window (or on the empty screen) choose
**Set up a whole story project**, give the story a name, and Exomyth creates a folder with that name
and eight inside: **1 Brainstorm, 2 Outline, 3 Drafts, 4 Story bible, 5 Art, 6 Research, 7 Notes,
8 Playlist**. Each holds one page that says what the folder is for, named after the story (so
several stories can live in one world), and an overview page links them all. The Drafts page is a
book, so **Book** works on it straight away, and the Playlist page is a playlist. Nothing is ever
overwritten: asking again for the same story only adds pages that are missing.

## Writing helpers

- **Word count.** The top bar shows how many words the open page has; hover it for the whole world.
  Only the text a reader sees counts: links count as their shown text, the header and files do not.
- **Writing stats.** The chart button in the top bar opens your writing: words and time today and in
  the last 7 days, the streak of days in a row, the total, and the last 30 days as a chart. Set a
  **daily goal** and the top bar shows `120 of 500 today`; the streak then counts the days you
  reached it (without a goal, any day you wrote). A word counts when a page is saved from the editor
  and adds to its text, so deleting never takes words away; time is the time you spend typing, and a
  pause longer than a minute does not count. The stats are kept in your world, in
  `.exomyth/writing.json`, and never sent anywhere. **Clear stats** starts again from zero.
- **Focus mode.** **Ctrl+.** (or the corners button in the top bar) hides everything but the text you
  are writing, with the word count in the corner. **Esc** brings the rest back. With **typewriter
  scrolling** the line you are writing stays in the middle of the screen and the other paragraphs are
  dimmed a little (it never changes the text; switch it off in Settings).
- **Spell check.** The editor uses the browser's own spell checker, which works offline in the
  languages set up in the browser. The **ABC** button in the top bar turns it off, for example while
  a page is full of invented names.
- **Quick notes.** Press **Alt+I** anywhere (or the light bulb at the top of the sidebar) to write
  down an idea without leaving the page. It is added with the date and time to an **Inbox** page,
  which is created the first time.
- **Quick look-up.** **Ctrl+K** (or the magnifier in the top bar) opens a search over whatever you are
  looking at: the text, graph, cards, timeline or book. The arrow keys move through the results and the
  page you point at is previewed next to the list, so you can check a name or a date without leaving
  the page. **Enter** opens it; **Esc** closes the look-up and you are back exactly where you were, in
  focus mode too. With the look-up switched off in Settings, **Ctrl+K** goes to the search field in the
  sidebar instead.

## Editing: comments, notes and versions

The speech-bubble button in the top bar opens the **Editing** panel in place of the relations panel.
It holds everything for the next pass over a page:

- **Comments.** Select a passage in the editor and press **Ctrl+Alt+M** (or **+ Comment** in the
  panel). The comment is written into the text with the open CriticMarkup notation, so it stays with
  its passage when the text is edited or copied, and other Markdown editors show it as plain text:

  ```markdown
  Arn drew {==his old sword==}{>>Which sword? Name it.<<} and waited.{>>Slow here<<}
  ```

  The reading view highlights the passage and shows a numbered marker; point at it (or tap it) to
  read the comment. In the panel, click a comment to jump to it, ✎ to change it and ✓ to resolve it
  (the passage stays, the comment goes). In **Reading** you can also select words and press the
  **Comment** button that appears under them.
- **Replies.** **Reply** under a comment adds a reply right after it, `{>>Why?<<}{>>Because.<<}`:
  comments written one after another are a thread. The reading view shows the replies under the
  comment, and resolving it takes the whole thread.
- **Suggested changes.** `{++added++}`, `{--removed--}` and `{~~old~>new~~}` show as additions and
  removals. **Accept** or **Reject** them one by one or all at once. Switch on **Suggest changes**
  (or press **Ctrl+Shift+E**) and what you type in the editor is written as an addition and what you
  erase stays as a removal, like tracked changes; erasing your own new words simply erases them. A
  green line on top of the editor shows it is on. New paragraphs are not tracked. Until a change is accepted it is
  not part of the text: word counts, previews, the book view and exports show the text as it was,
  without comments.
- **To fix.** A checklist of what to change on the page, kept in its header. **In the whole world**
  lists every page with open comments, changes or notes.

  ```yaml
  revision:
    - Raise the stakes before the duel
    - "[x] Check the year of the flood"
  ```

- **Versions.** Before you edit a page, Exomyth keeps a copy of it, at most once every 30 minutes and
  only when the text has changed. A page keeps no more than 20 of these; older ones are thinned out
  evenly, so early drafts stay too. **Save version…** keeps a named copy that is never removed by
  itself (☆ gives a name to one saved by itself). **Compare** shows word by word what changed between
  a version and the current text, or between two versions, and **Restore “Before”** brings a version
  back after keeping the current text as a version. Versions are plain Markdown files in
  `.exomyth/versions/<page path>/`, named by date and time, so any editor can open them. They move
  with their page when it is renamed, moved or put in the trash.

Both parts can be switched off in Settings: **Editing: comments and notes** and **Page versions**.

## Page templates

**+ New page** lets you start from a template: Character, Place, Organization, Event, Scene, Playlist or Mood board. Each
fills in the usual header fields (years, relations to fill) and section headings, and suggests the
folder the page goes to. (Playlist and Mood board are left out while playlists or mood boards are switched off in Settings.)

Templates are ordinary pages in the world's `Templates/` folder, so you can change them or write your
own. Until a world has its own, the built-in set is offered; "Add them to the world" in the dialog
copies it into `Templates/`. In a template, `{{title}}` becomes the new page's name, `{{date}}` today's
date, and a `template:` block in the header is not copied:

```yaml
template:
  folder: Ships        # where new pages of this kind go
tags: [ship]
```

**Story structure.** Under the usual templates the window has a second group, **Story structure**:
**Three acts**, **Five acts**, **Hero's journey**, **Seven points** and **Kishōtenketsu**, five
well-known shapes written in our own words. Each makes a page in `Outlines/` with a heading for every
part, a question under it to answer, and a **Check the draft** list at the end, so the same page
plans a story or checks one you have written. Link the scenes that carry each part
(`- [[Scene name]]`) and the plan connects to the story. The shapes are always offered, even in a world
with templates of its own (its own copy with the same name replaces the built-in one; "Add them to
the world" copies them too, with `group: structure` in the `template:` block). Switch them off in
Settings.

Template pages are not part of the world itself: they stay out of the graph, cards, timeline, tags and
word counts, and links never lead to them.

## Folders

Pages live in folders (Characters, Places…). To move a page, drag it onto a folder in the sidebar (or
onto the world's name for the top level), or use the folder button next to the page. Links by name
keep working; links written with a folder path are updated.

## Start profiles

A new, empty world asks **What are you making?**

| Profile | On | Off |
| --- | --- | --- |
| ✍️ Writer | Book, cards, timeline, family trees, focus mode, word count, writing stats, story projects, story structures, comments and versions | Graph, maps |
| 🗺️ Worldbuilder | Graph, cards, maps, timeline, family trees | Book, focus mode, word count, writing stats, story projects, story structures |
| 🎲 Game master | Graph, cards, maps, timeline, family trees, quick notes, page versions; a Session template | Book, focus mode, word count, writing stats, story projects, story structures, comments |
| 🗒️ Just notes | Graph, cards, links | Timeline, years, maps, family trees, Book, focus mode, playlists, mood boards, writing stats, story projects, story structures, comments, page versions |
| ✨ Everything | All of it, like the demo world | — |

A profile only switches parts on and off and adds a few starting pages (a "Start here" page; for a
writer, a book named after the world). Choose another one any time in **Settings → World profile**,
or switch single parts there. Each world keeps its own choice.

## Settings

The gear at the bottom of the sidebar (or **Ctrl+,**) opens the settings. Turn off what you do not
use and the app gets simpler: the Graph, Cards and Timeline views, family trees, interactive maps,
years, playlists, mood boards, the quick look-up, the relations panel, previews on hover, the word count, writing stats, story projects, story structures, comments and notes, page versions, quick
notes, focus mode (and its typewriter scrolling) and spell check. Theme and language are there too. Under a switch, Settings say how many pages of the open
world use that part (maps, years, family trees) and list them, so you know what would be hidden. Everything is on to begin with; settings are kept in the
browser, never in your worlds, and "Turn everything back on" restores them in one click.

## Keyboard shortcuts

Press **Ctrl+/** (or **?** outside a text field), or the keyboard button at the bottom of the sidebar,
for the list of all shortcuts. The most useful: **Ctrl+K** quick look-up, **Alt+I** quick note,
**Ctrl+Alt+M** a comment on the selection, **Ctrl+Shift+E** suggest changes, **Ctrl+click** on a `[[link]]` in the editor to follow it. On a Mac, use ⌘ instead of Ctrl and ⌥
instead of Alt.

## Backups: a world as a .zip

The arrow button at the top of the sidebar downloads the whole world (pages, settings, pictures,
sounds, saved versions) as one .zip file. Inside is a normal world folder, so it can be unpacked and opened as a
folder, or opened again with **Open a world from a .zip** on the start screen, which adds it as a
new world in the browser. Nothing is uploaded anywhere; the file is made on your device.

Worlds kept in the browser can be cleared by the browser when the disk is nearly full. Exomyth asks
the browser to keep them, but a .zip now and then is the safe way to back up.

## Family trees

In **Cards**, the **Family tree** tab draws the family of the selected character: grandparents,
parents, brothers and sisters (half-siblings too), spouses, children and grandchildren, each with
their picture and years. Click someone to move the tree to them; double-click to open their page.
The tree button at the top of the relations panel opens it for the current page.

Trees are drawn from ordinary relations: `father`, `mother`, `parent`, `son`, `daughter`, `children`,
`spouse`, `wife`, `husband`, `brother`, `sister`, `sibling`, and the same words in Russian. For other
words, set `"family": "parent"` (or `child`, `spouse`, `sibling`) on the relation type in
`.exomyth/settings.json`; `"family": "none"` keeps a word out of trees.

## Images, video and audio

Drag files into the editor, paste a screenshot, or use the image button in the top bar. Files are saved
into the world's `attachments/` folder and embedded with `![[file name]]`. Supported: PNG, JPEG, GIF,
WebP, AVIF, SVG, BMP; MP4, WebM, OGV, MOV; MP3, WAV, OGG, Opus, M4A, AAC, FLAC. Media play from your
own storage; images from web addresses are shown as links and never loaded automatically.
In **Text** mode the pictures and players appear right under the lines that embed them; in **Side by
side** they are shown in the reading pane.

## Mood boards

A free board for a character, a place, a scene or a whole story: pictures, colours, quotes, notes and
cards of other pages, placed where you like. A page with `moodboard: true` in its header shows its board
above its text. Make one with the **Mood board** template (**+ New page**), open it in **Reading** or
**Side by side**, and choose **Edit board**:

- **+ Picture** saves pictures from your device into the world and pins them; **+ From the world**
  pins a picture the world already has.
- **+ Colour** pins a swatch (change it with the round button on it); **+ Quote** pins words, with the
  source on a last line that starts with a dash; **+ Note** pins free text on coloured paper (change
  the colour with the round button on it); **+ Page** pins a card of another page, which opens that
  page when you click it outside editing.
- Drag an item to move it and its corner to resize it. Moving an item puts it on top. With the keyboard,
  tab to an item's move button: arrow keys move it (Shift for bigger steps), **+** and **−** resize it,
  **Delete** removes it. The pencil changes a quote, a note or a caption.
- While you drag, edges and middles line up with the other items and the board (a thin line shows
  which); hold **Alt** to place an item freely.
- **Shift** on a picture's corner crops it to a height; after that the picture keeps its shape when
  resized, and **↺** shows it whole again.

**−** and **+** zoom the board (also **Ctrl + wheel**; click the percentage for 100%), which helps with
big boards; each board remembers its zoom in this browser. **Save as picture** draws the whole board
into one PNG file on your device, ready to share.

Everything is kept in the page's header, as a plain list, so the board is an ordinary file that you can
read, edit and keep. Positions and sizes are fractions of the board's width:

```yaml
moodboard: true
board:
  - image: storm coast.jpg
    caption: Where it starts
    x: 0.05          # from the left edge
    y: 0.04          # from the top, in board widths
    w: 0.4           # width; the height follows the picture
    h: 0.3           # optional: crop the picture to this height
  - color: "#a86214"
    x: 0.5
    y: 0.04
    w: 0.12
    h: 0.12          # colours always have a height
  - quote: The sea keeps what it is given.
    source: Old saying
    x: 0.5
    y: 0.25
    w: 0.3
  - page: "[[Kira Vale]]"
    x: 0.1
    y: 0.5
    w: 0.2
  - note: Storms come from the west.
    tint: "#f3e3a1" # the paper colour
    x: 0.4
    y: 0.5
    w: 0.2
```

Items later in the list lie on top of earlier ones. A pinned page is a link like any other, so it shows
in the relations panel and on the graph. The demo world has a board, **The Look of Rivertown**. On a
narrow screen the board scrolls sideways inside its frame, so pictures and words keep their size. Switch
boards off in Settings and such a page is an ordinary page.

## Playlists

Music for a world, a place or a scene. A page with `playlist: true` in its header is a playlist; its
tracks are the list items that embed an audio file, in order:

```markdown
---
playlist: true
---
# The Tavern

Played while the party rests.

- ![[Fiddle in the rain.mp3]]
- ![[Last call.ogg|Last call, slow]]
```

The reading view shows a player above the text: play, previous and next, repeat, and the list of
tracks to pick from. Tracks play one after another; a track whose file is missing is marked and
skipped. The text after `|` names a track, otherwise the file name does. Any page can be a playlist,
so a scene can carry its own music. The music stops when you leave the page. The **Playlist** template
starts one in a `Music` folder, and the demo world has a playlist of its own, [Rivertown Evening](examples/demo-world/Music/Rivertown%20Evening.md), with three short tracks made for it. With playlists switched
off in Settings, such a page is an ordinary page with a player under each line, as before.

## Page previews

Hover or focus a link (in the reading view, the editor or the relations panel) to see a
card with the page's title, folder, aliases, a few facts, the opening of its text and its link counts.
`[[Page#Section]]` shows that section. On the graph the card appears in the top-right corner, so it
never covers the connections of the page you point at.

## Project layout

```
src/core/      Pure TypeScript, no UI: parsing, link index, relations panel model,
               graph model and stable layout, page previews,
               storage (folder / browser / memory), vault operations
src/components Svelte 5 interface
tests/         Vitest: core logic and rendered interface (jsdom)
```

The relations panel is a pure function of the pages in the world (`VaultIndex.panel`), which is what
guarantees stable ordering; `tests/core.test.ts` checks that shuffling load order changes nothing.

## Roadmap

1. ✅ Core: wiki, typed relations, stable panel, search, tags, safe rename
2. ✅ Relations graph with a stable layout; page previews on hover
3. ✅ Cards, interactive maps with pins, images, video and audio
4. ✅ Timeline of pages and moving through the years on the graph, cards and maps
5. Next: download a world as a .zip, page templates, writing tools, custom calendars, map regions,
   family trees, a desktop app

The full list, with sizes and notes, is in [ROADMAP.md](ROADMAP.md).

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first: Exomyth is
written from scratch, and code copied from other apps cannot be accepted. Libraries used by the app
are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); changes are in [CHANGELOG.md](CHANGELOG.md).
