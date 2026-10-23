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
- **Edit pins**: click the map to place a pin, drag pins to move them, and set the selected pin's page,
  label and years. Arrow keys move the selected pin; Delete removes it.
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

## Writing helpers

- **Word count.** The top bar shows how many words the open page has; hover it for the whole world.
  Only the text a reader sees counts: links count as their shown text, the header and files do not.
- **Focus mode.** **Ctrl+.** (or the corners button in the top bar) hides everything but the text you
  are writing, with the word count in the corner. **Esc** brings the rest back.
- **Spell check.** The editor uses the browser's own spell checker, which works offline in the
  languages set up in the browser. The **ABC** button in the top bar turns it off, for example while
  a page is full of invented names.
- **Quick notes.** Press **Alt+I** anywhere (or the light bulb at the top of the sidebar) to write
  down an idea without leaving the page. It is added with the date and time to an **Inbox** page,
  which is created the first time.

## Page templates

**+ New page** lets you start from a template: Character, Place, Organization, Event or Scene. Each
fills in the usual header fields (years, relations to fill) and section headings, and suggests the
folder the page goes to.

Templates are ordinary pages in the world's `Templates/` folder, so you can change them or write your
own. Until a world has its own, the built-in set is offered; "Add them to the world" in the dialog
copies it into `Templates/`. In a template, `{{title}}` becomes the new page's name, `{{date}}` today's
date, and a `template:` block in the header is not copied:

```yaml
template:
  folder: Ships        # where new pages of this kind go
tags: [ship]
```

Template pages are not part of the world itself: they stay out of the graph, cards, timeline, tags and
word counts, and links never lead to them.

## Folders

Pages live in folders (Characters, Places…). To move a page, drag it onto a folder in the sidebar (or
onto the world's name for the top level), or use the folder button next to the page. Links by name
keep working; links written with a folder path are updated.

## Keyboard shortcuts

Press **Ctrl+/** (or **?** outside a text field), or the keyboard button at the bottom of the sidebar,
for the list of all shortcuts. The most useful: **Ctrl+K** search, **Alt+I** quick note,
**Ctrl+click** on a `[[link]]` in the editor to follow it. On a Mac, use ⌘ instead of Ctrl and ⌥
instead of Alt.

## Backups: a world as a .zip

The arrow button at the top of the sidebar downloads the whole world (pages, settings, pictures,
sounds) as one .zip file. Inside is a normal world folder, so it can be unpacked and opened as a
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
