# Changelog

## 0.10.0 — 2026-10-23

### Added

- **Focus mode**: Ctrl+. (or the button in the top bar) shows only the text being written, with the
  word count in the corner; Esc returns to the view you came from.
- **Move a page to another folder**: drag it onto a folder in the sidebar (or onto the world's name for
  the top level), or use the new folder button next to a page, which suggests existing folders and
  accepts new ones. Links written with a folder path are updated; links by name keep working.
- **Spell check switch**: the ABC button in the top bar turns the browser's offline spell checker on or
  off in the editor, and the choice is remembered.

### Changed

- The top bar is a little more compact, so the view switcher fits next to the new buttons.

## 0.9.0 — 2026-10-23

### Added

- **Keyboard shortcuts list.** Ctrl+/ (or "?" outside a text field), or the keyboard button at the
  bottom of the sidebar, shows every shortcut of the app, grouped by where it works. On a Mac it shows
  ⌘ and ⌥.

## 0.8.0 — 2026-10-23

### Added

- **Download a world as a .zip**: the arrow button at the top of the sidebar saves every file of the
  world (pages, settings, pictures, sounds) in one .zip, inside a folder named after the world.
- **Open a world from a .zip** on the start screen: the world is added to the browser as a new one.
  Unsafe paths in an archive (absolute paths, `..`, system leftovers) are skipped, and archives over
  20,000 files or 1 GB are refused.
- **Quick notes**: Alt+I (or the light bulb in the sidebar) opens a note box from anywhere; the note is
  added with the date and time to an Inbox page, created the first time.
- **Word count** of the open page in the top bar, and of the whole world on hover. Links count as their
  shown text; the header, files and web addresses do not count. Works for any language.
- Exomyth asks the browser to keep the worlds it stores, so they are not cleared when space runs low
  (the browser decides).

### Changed

- The reading view no longer repeats a page's title when its text starts with the same heading.

## 0.7.0 — 2026-10-23

### Added

- **Timeline.** A new view in the top bar shows every page with years as a row, grouped by folder:
  bars for lifetimes and eras, diamonds for one-year events, and bars that fade out for what is still
  going. Zoom with the buttons or `Ctrl` + wheel; click selects a page, double-click opens it, and
  hovering shows its preview.
- **Years of pages.** Read from the page header in the words that fit the page: `from`/`to`,
  `born`/`died`, `founded`/`destroyed` and similar, `year: 430` for an event or `years: 429-430`
  (a few Russian words work too). New **Years** fields in the relations panel edit them and keep the
  field names the page already uses.
- **Moving through the years everywhere.** "Show by year" is now one year for the whole world, kept
  per world: press and drag on the timeline's scale, or use the slider under the graph, cards,
  timeline and maps. Pages that do not exist in that year are faded on the graph and cards, and map
  pins are hidden.
- Map pins without years of their own follow the years of their page.
- Demo world: years for its characters, places and order, and two events (the Great Flood and the
  Siege of Rivertown). Demo worlds saved by earlier versions are updated; your own edits are kept.

### Fixed

- Removing the last field from a page header no longer leaves `{}` behind; the empty header is removed.
- On narrow screens the view switcher wraps onto its own line instead of overflowing.

## 0.6.1 — 2026-10-23

### Security

- Pages from a world someone else shared can no longer imitate the app: inline styles, the app's own
  style classes, buttons, text fields and other form controls are removed when a page is shown (task
  list checkboxes stay, read-only). Scripts, frames and web images were already blocked.
- The publishing workflow now gives each job only the permissions it needs: the build job can only
  read; only the deploy job can publish.
- `.gitignore` also ignores `.env`, `*.pem` and `*.key` files, so secrets are not committed by mistake.

## 0.6.0 — 2026-10-23

### Added

- **Interactive maps.** A page with `map: picture` in its header shows an interactive map in the reading
  view: zoom, pan, full screen. Pins point to pages or carry a label, use their page's folder colour,
  show a preview on hover and open the page on click.
- **Editing pins**: click to place, drag to move, arrow keys to nudge, Delete to remove; the selected
  pin's page, label and years are edited below the map. Pins are written to the page header as plain
  text (`pins:`), with positions as fractions of the picture.
- **Moving through the years**: pins can have `from` and `to` years. "Show by year" adds a slider that
  shows only what existed in the chosen year.
- Map pages show their map as the picture on cards, and in the editor under the `map:` line.
- Demo world: "Silver Coast", an original map with four pins and their years.

### Changed

- Editing a page header keeps short lists as they were written (`tags: [map]` no longer becomes
  `tags: [ map ]`).

## 0.5.3 — 2026-10-23

### Fixed

- A demo world saved by an earlier version now updates itself when opened: new demo files (the Order's
  emblem, its new members, the Rivertown map) are added, and demo pages you never edited are replaced
  by their current version. Pages you changed or added are left exactly as they are.

## 0.5.2 — 2026-10-23

### Fixed

- The app no longer waits for the one-time data carry-over from the old name before starting. Some
  browsers (older Safari versions in particular) can leave a storage request hanging, which could
  keep the page blank.
- If the app cannot start at all, the page now says so after a few seconds instead of staying blank.

## 0.5.1 — 2026-10-23

### Added

- In **Text** mode, images, video and audio now appear right in the editor, under the line that embeds
  them (`![[file]]`, `![alt](path)` and the `image:` field). The text stays as it is and can be edited
  as before. In **Side by side** mode they stay in the reading pane, so nothing is shown twice.

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
