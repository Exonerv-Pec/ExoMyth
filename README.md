# Exomyth

A private, offline-first wiki for writers and world builders. Your world is a folder of plain
Markdown files on your own device. No account, no server, no tracking.

> **Status: early alpha (v0.2).** Pages, typed relations, a stable relations panel, a relations
> graph with a stable layout, page previews on hover, search, tags, rename with link updates.
> Timeline and interactive maps are next (see the roadmap). [Русская версия](README.ru.md)

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

## Cards

Switch to **Cards** in the top bar to browse the world as cards.

- **Folder tabs** (Characters, Places, Organizations...) show every page of a folder as a card with
  its picture or initials, folder colour and key facts.
- **Page dossier** shows the selected page as a large card, and below it every related page as a
  card, grouped by relation: for an organization, its leader, members, allies and the pages that
  mention it. Groups and cards come in the same fixed order as the relations panel.
- Click a card to open its dossier, double-click to open the page itself.

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
3. Timeline with custom calendars (months, eras, non-Gregorian), swim lanes, linked to pages
4. Interactive maps: your own image, pins and regions that link to pages, layers; canvas; family trees
5. Export a world as a static site to share with players or readers
6. Desktop build (Tauri) for all browsers' limits

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first: Exomyth is
written from scratch, and code copied from other apps cannot be accepted. Libraries used by the app
are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); changes are in [CHANGELOG.md](CHANGELOG.md).
