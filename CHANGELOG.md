# Changelog

## 0.5.0 — 2026-10-23

### Added

- **Cards view.** A new mode next to Graph. Folder tabs show every page of a folder as a card
  (picture or initials, folder colour, key facts). The dossier of a page shows it as a large card
  with everything related to it below, grouped by relation in the same fixed order as the relations
  panel: for an organization, its leader, members, allies and mentions. Click a card to walk to its
  dossier; double-click to open the page.
- **`image:` field** for a page's picture (portrait, emblem, map). It is shown at the top of the
  infobox and on cards; without it, the first image in the text is used.
- Folders have the same colour on the graph and on cards.
- The demo world has two members of the Order (Mara Holt, Brother Tomas), a "member of" relation type
  with the reverse label "members", and an emblem for the Order.

## 0.4.0 — 2026-10-23

### Added

- **Images, video and audio in pages.** Drag files into the editor, paste a screenshot, or use the new
  image button in the top bar. Files are saved into `attachments/` inside the world (names are kept
  unique) and embedded with `![[file]]`; `![[file|400]]` sets a width and `![[file|text]]` adds a
  caption. Standard Markdown images of the world (`![alt](attachments/x.png)`) work too. Everything
  plays from the world's own storage; images from web addresses become links and are never loaded.
- The demo world has a map of Rivertown.
- `BUILDING.md` and `BUILDING.ru.md`: how to run, test, build and publish Exomyth.

### Changed

- On the graph, the preview card of a hovered page appears in the top-right corner of the graph
  instead of next to the page, so it no longer covers the page's connections.

## 0.3.0 — 2026-10-22

### Changed

- **The project is now called Exomyth** (it was developed as "Mythloom" until this version).
  World metadata now lives in `.exomyth/` inside a world folder.

### Compatibility

- Worlds created with earlier versions keep working: settings and graph positions in an old
  `.mythloom/` folder are read when no `.exomyth/` copy exists. New saves go to `.exomyth/`; the old
  folder is never changed or deleted.
- Preferences, browser-stored worlds and remembered folders saved under the old name are moved to
  the new name the first time the app starts.

## 0.2.3 — 2026-10-22

### Added

- The demo world is now a real folder in the repository, `examples/demo-world/`. The app bundles
  those same files for "Open the demo world", and a test keeps the two identical.

## 0.2.2 — 2026-10-22

### Added

- Worlds kept in the browser can be deleted from the welcome screen (with a confirmation).
- The Russian demo created by earlier versions is labelled "old Russian demo" in that list.

## 0.2.1 — 2026-10-22

### Changed

- The demo world is now in English (characters, places, relation types and the welcome page).
  It is stored in the browser as "Demo world". A Russian demo opened with an earlier version stays
  in the list of worlds in this browser under the name "Demo".

## 0.2.0 — 2026-10-22

### Added

- **Relations graph.** A fourth view mode, "Graph", shows every page of the world and how they
  are connected. Typed relations and plain mentions are drawn differently; pages are coloured by
  top-level folder; hovering a page highlights its neighbours and names the relations.
  - **Stable layout.** Positions are computed once and saved in `.mythloom/graph.json` inside the
    world. New pages appear next to their neighbours; nothing that already has a place moves.
    "Lay out again" recomputes everything, only when you ask.
  - **Unconnected pages** sit on a separate shelf under the graph, drawn as hollow circles.
  - Drag pages to move them (saved), zoom and pan with mouse, touch or keyboard, show only the
    neighbours of the selected page (one or two steps), dim pages without a chosen tag, hide
    mentions or the shelf. The last view of each world is remembered.
  - "Show on graph" button in the relations panel.
- **Page previews on hover.** Hovering (or focusing) a link shows a card with the page's title,
  folder, aliases, a few facts from its header, the opening of its text and its link counts.
  `[[Page#Section]]` links preview just that section. Works in the reading view, the editor, the
  relations panel and the graph. Links to missing pages offer to create them.
- `CONTRIBUTING.md` with the clean-room rule, and `THIRD_PARTY_NOTICES.md`.

### Fixed

- Links with a partial path (`[[Folder/Page]]`) could match a folder whose name merely ended the
  same way (`her/Page` matched `Other/Page`).
- A symmetric relation declared on both pages showed "×2" in the panel.
- Renaming a page by changing only letter case left a duplicate file in browser-stored worlds.
- Renaming a page did not update `![[embeds]]` of it.
- Pinning a page by its alias and unpinning it by its name did not match.
- Typing that was still waiting for autosave could be lost when the tab was closed; it is now
  saved when the tab is hidden or closed, and the browser warns while a save is pending.
- A markdown link to an anchor (`[text](#part)`) was read as the tag `#part`.
- Editing relations turned Windows line endings in the page header into Unix ones.
- Adding a relation to a page whose header is not a list of `key: value` lines silently did
  nothing; it now reports the problem.
- A relation typed as `Name|text` or `Name#Section` in the panel created a page with a mangled
  name.
- A refresh triggered by returning to the window could run at the same time as a save; vault
  operations now run one at a time.
- Moving a page to the trash could leave the app showing a page that no longer existed.
- On narrow screens the relations panel stayed open over the page after following a link.
- Preferences no longer fail when the browser blocks storage (private windows, embedded frames).

## 0.1.0 — 2026-10-22

First version: pages as Markdown files, typed relations with a stable relations panel, search,
tags, rename with link updates, trash, light and dark themes, Russian and English.
