# Changelog

## 0.30.0 — 2026-10-25

### Added

- **Dates with months and days.** Header fields such as `born:`, `year:` and `years:` take dates as
  well as years: `3 March 412`, `March 412`, `412-03-03`, `5 марта 412`, and spans in one field like
  `28 Leaffall 429 – Thaw 430`. The **Years** fields of the panel take them too and write them as
  words. A plain year works as before.
- **Calendars of your own.** A page with `calendar: true` gives the world its months (with their
  days), its week and its eras; the world uses its first such page (templates never count). The
  page shows the calendar: eras, and each month's days in weeks for a chosen year. A built-in
  **Calendar** template starts one.
- **Eras.** Years show with their era (`412 AR`, or `318 – 381 AR` when both ends share it) on the
  timeline, in the panel, on family trees and on the year slider; `112 SA` and `Year 112 of the Second
  Age` read as the right year.
- **The timeline** places dates inside their year, ends bars at the end of their last month or day,
  and names the months once it is zoomed in far enough (it can now zoom much further).
- The demo world has **Calendar of the Coast**, and the siege and the flood have dates.
- A guide topic, **Calendars**, with its picture; the other pictures are made again.

### Changed

- A date counts for its whole year when moving through the years.
- The timeline keeps room for page names when dates are long; the whole date shows on pointing.

## 0.29.0 — 2026-10-25

### Added

- **A first-run tour.** The first time a world is opened in a browser, six short hints point out the
  main parts of the screen: the pages of the world, the ways to look at it, the relations panel, the
  quick keys and the guide. The part being talked about is lit up and the hint stands beside it (in
  the middle on a phone when the part is tucked away). **Next**, **Back**, the arrow keys, and **Skip**
  or **Esc**; once finished or skipped it does not come back by itself.
- **Show the tour** at the top of the guide takes it again.

## 0.28.0 — 2026-10-25

### Added

- **Music that keeps playing.** One player for the whole app: a playlist goes on playing while you open
  other pages. A small player in the corner shows the track and the playlist, with pause, previous,
  next and stop; its name opens the playlist again (in Reading when you were in Text). In focus mode
  it sits in the other corner and fades until you point at it. Playing another playlist takes over;
  renaming or moving the playlist page keeps the music, and putting it in the trash, switching
  playlists off or closing the world stops it. Media keys and the lock screen can control it where
  the browser offers them.
- A switch in Settings, **Music keeps playing** (under Playlists; off for Just notes), to have the
  music stop when you leave the playlist page, as before.
- The playlist player has its own buttons now: play and pause, the place in the track with the time,
  and a volume that is remembered in this browser.

### Changed

- The guide's Playlists topic and its picture describe the new player.

## 0.27.0 — 2026-10-25

### Added

- **Guide.** **F1**, the **?** button at the bottom of the sidebar or **Guide** on the start screen
  opens a guide to every part of Exomyth: 20 topics, each with a picture of the demo world (in the dark
  theme), a few lines on what it does and how, and a **Try it** button that opens the right view,
  page or window. A topic for a part switched off in Settings says so and can switch it on. The
  guide can be searched, and follows the interface language.
- The same guide on GitHub: [docs/GUIDE.md](docs/GUIDE.md) and [docs/GUIDE.ru.md](docs/GUIDE.ru.md).
  The app reads its topics from these files, so there is one text to keep up to date.
- `npm run guide:shots` makes the pictures again from the demo world in English and Russian (WebP,
  about 2 MB in all). They are files of the site and load only when a topic is opened; the one-file
  build shows the guide without them.

### Changed

- The demo world's Welcome page points to the guide.

## 0.26.0 — 2026-10-25

### Added

- **Suggest changes.** A switch in the Editing panel (and **Ctrl+Shift+E** in the editor): while it is
  on, what you type is written as `{++addition++}` and what you erase stays as `{--removal--}`, ready to
  accept or reject. Typing on continues the same addition, Backspace and Delete grow the same removal,
  typing over a selection marks it removed and adds the new words after it, and erasing your own new
  words erases them for good. Comments, the page header and new paragraphs are left alone; undo and
  changes made from the panel are never turned into suggestions. A chip in the top bar and a green
  line on the editor show the mode; it is remembered per world in this browser.
- **Replies under comments.** **Reply** adds a comment right after a comment; such comments are its
  thread (`{>>Why?<<}{>>Because.<<}`). The panel lists replies under their comment and can change or
  remove each; the reading view shows them in the comment's box and their number on its marker.
- **Comments from the reading view.** Select words in **Reading** and a **Comment** button appears
  under them. The words are found in the page text even across emphasis or a `[[link|shown text]]`
  (a link is kept whole), and the right one is picked when the same words appear more than once.

### Changed

- The demo scene **The Market** has a reply under its first comment.

## 0.25.0 — 2026-10-25

### Added

- **Notes on mood boards.** **+ Note** pins free text on coloured paper (`note:` with a `tint:`);
  the paper takes pale colours in turn and can be changed with the round button on it, and the text
  turns light on dark paper.
- **Lining up.** While an item is dragged or resized, its edges and middle line up with the other
  items and with the board's edges and middle, and a thin line shows which. Hold **Alt** to place
  freely.
- **Cropping pictures.** **Shift** on a picture's corner crops it to a height (`h:` on a picture); a
  cropped picture keeps its shape when resized, and **↺** shows it whole again.
- **Zoom.** **−**, **+** and **Ctrl + wheel** zoom a board from 50% to 300%; each board remembers its
  zoom in this browser.
- **Save as picture.** Draws the whole board into one PNG on your device (pictures, colours, quotes,
  notes and page cards, in the board's own colours).

### Changed

- The demo board **The Look of Rivertown** has two notes and a cropped map.

## 0.24.0 — 2026-10-24

### Added

- **Editing workspace.** A speech-bubble button in the top bar opens the **Editing** panel in place of
  the relations panel, with comments, suggested changes, a to-fix list and versions of the page.
- **Comments in the text.** Select a passage and press **Ctrl+Alt+M** (or **+ Comment**): the comment is
  written with the open CriticMarkup notation, `{==passage==}{>>comment<<}`, so it moves with its
  passage and stays readable in other editors. The editor colours comments; the reading view
  highlights the passage with a numbered marker that shows the comment on hover or tap. The panel
  jumps to a comment, edits it, or resolves it (the passage stays).
- **Suggested changes.** `{++added++}`, `{--removed--}` and `{~~old~>new~~}` show as additions and
  removals and can be accepted or rejected one by one or all at once.
- **To fix.** A checklist per page, kept in the header under `revision:` (`"[x] …"` for done items), and
  a list of every page in the world with open comments, changes or notes.
- **Page versions.** Before a page is edited, a copy of it is kept by itself, at most once every 30
  minutes and only when the text changed; a page keeps at most 20 of these, thinned out evenly over
  time. Named versions (**Save version…**) are never removed by themselves. **Compare** shows the
  changes word by word between a version and the current text or two versions, with the number of
  words added and removed; **Restore** brings a version back after keeping the current text as a
  version. Versions are plain Markdown files in `.exomyth/versions/<page path>/`, follow their page
  on rename, move and trash, and are part of the world's .zip.
- Two switches in Settings, **Editing: comments and notes** and **Page versions**; the Game master
  profile leaves comments off, Just notes leaves both off. The demo scene **The Market** has comments,
  a change, notes and a first draft to compare.

### Changed

- Word counts, previews, cards, the book view and book exports leave comments out and show
  suggested changes as not yet made.
- Opening and refreshing a world never reads saved versions, so many versions do not slow it down.
- The panel titles keep the space before “· page name”.

## 0.23.0 — 2026-10-24

### Added

- **Mood boards.** A page with `moodboard: true` shows a free board above its text: pictures,
  colours, quotes and cards of other pages. **Edit board** (in Reading or Side by side) adds them
  (a picture from your device or from the world, a colour, a quote, a page), moves them by dragging,
  resizes them from the corner, and removes them. The keyboard works too: arrow keys move the chosen
  item, **+** and **−** resize it, **Delete** removes it. A moved item goes on top.
- The board is kept in the page header as a plain `board:` list, with positions and sizes as fractions
  of the board's width, so it looks the same on any screen and the file stays readable. Colours
  are checked and only plain hex values are used. A pinned page is an ordinary link, so it shows in the
  relations panel and on the graph.
- A built-in **Mood board** template (in `Boards/`), a switch in Settings (with the pages that use it),
  off for the Just notes profile, and a board in the demo world, **The Look of Rivertown**.

### Changed

- The `moodboard` and `board` header fields are not shown as facts in a page's infobox.

## 0.22.0 — 2026-10-24

### Added

- **Story structure templates.** **+ New page** has a second group of templates, **Story
  structure**: **Three acts**, **Five acts**, **Hero's journey**, **Seven points** and
  **Kishōtenketsu**, in English and Russian, written in our own words. Each makes a page in
  `Outlines/` (`Структуры/`) with a heading for every part, a question under it, and a **Check the
  draft** checklist at the end, so one page plans a story or checks a draft. Link the scenes that
  carry each part to connect the plan to the story.
- The shapes are offered even when a world has templates of its own; a template of the world with the
  same name replaces the built-in one. **Add them to the world** copies them too, marked with
  `group: structure` in the `template:` block (a new field next to `folder:`).
- A switch in Settings, off for the Worldbuilder, Game master and Just notes profiles.

## 0.21.0 — 2026-10-24

### Added

- **Playlist template.** **+ New page** offers a built-in **Playlist** template (a page with
  `playlist: true`, in a `Music` folder, with a note on how to add tracks). It is left out while
  playlists are switched off in Settings, and "Add them to the world" copies it with the others.
- **Music in the demo world.** The demo has a playlist, **Rivertown Evening**, with three short
  tracks of our own (a jig, a slow waltz and a dawn pad, about 8 seconds each, 8 kHz mono WAV, 216 KB
  in all). They are made by `scripts/make-demo-tracks.mjs`, so they can be made again, and they are
  bundled inside the app, never downloaded. A demo saved by an earlier version gets the playlist and
  the tracks; a track the owner replaced is left alone.

### Changed

- The demo's Welcome page mentions playlists.

## 0.20.0 — 2026-10-24

### Added

- **Story projects.** The New page window (and the empty screen) offers **Set up a whole story
  project**: give a story a name and it gets a folder with eight inside, 1 Brainstorm, 2 Outline,
  3 Drafts, 4 Story bible, 5 Art, 6 Research, 7 Notes and 8 Playlist. Each holds one page that says
  what it is for, named after the story so several stories fit in one world, and an overview page
  links them all. The Drafts page is a book and the Playlist page is a playlist, so Book and the
  player work on them at once. Existing pages are never overwritten. A switch in Settings, off for
  the Worldbuilder, Game master and Just notes profiles.

## 0.19.0 — 2026-10-24

### Added

- **Writing stats.** The chart button in the top bar opens a window with the words and the time you
  wrote today and over the last 7 days, the streak of days in a row, the total, and the last 30 days
  as a chart. A **daily goal** is optional: with one, the top bar (and focus mode) show
  `120 of 500 today` and the streak counts the days you reached it; without one, any day you wrote
  counts. A word is counted when a page is saved from the editor and its text grew, so deleting
  never subtracts; time is the time between keystrokes, and a pause of over a minute is not counted.
  The stats live in the world, in `.exomyth/writing.json` (plain JSON, one line per day), and are
  never sent anywhere. **Clear stats** starts again from zero, after a confirmation. A switch in
  Settings, off by default for the Worldbuilder, Game master and Just notes profiles.

### Fixed

- Saving the open world's pending changes (`flush`) now writes the stats after the editors have
  saved, so the words of the last edit are not left out.

## 0.18.0 — 2026-10-24

### Added

- **Quick look-up.** **Ctrl+K** (or the magnifier in the top bar) opens a search over whatever is on
  screen: the text, graph, cards, timeline or book. Arrow keys move through the results, the chosen
  page is previewed next to the list (facts, the opening of its text, link counts), **Enter** opens it
  and **Esc** puts you back exactly where you were, in focus mode too. It can be switched off in
  Settings.
- **Typewriter scrolling.** In focus mode the line being written stays in the middle of the screen
  (typing and moving with the keyboard recentre it; a click does not), and the paragraphs around the
  one being written are dimmed a little. It only changes how the text is shown. A switch in Settings,
  under focus mode.
- **Playlists.** A page with `playlist: true` in its header shows a player above its text: the audio
  files of its list items (`- ![[Fiddle in the rain.mp3]]`, a name after `|` is optional) play one
  after another, with previous, next, repeat and the list of tracks to pick from. A track whose file
  is missing is marked and skipped. Any page can be a playlist, so a scene can carry its own music.
  The music stops when you leave the page. A switch in Settings, which says which pages are playlists.
- The Game master start page mentions playlists; the Just notes profile switches them off, and the
  profiles without focus mode switch typewriter scrolling off with it.

### Changed

- **Ctrl+K** now opens the quick look-up instead of moving to the search field in the sidebar. With
  the look-up switched off in Settings it works as before.
- The `playlist` header field is not shown as a fact in a page's infobox.

## 0.17.0 — 2026-10-24

### Added

- **Start profiles.** A new, empty world asks "What are you making?": Writer, Worldbuilder, Game master,
  Just notes or Everything. A profile switches on the parts that kind of work needs and off the rest
  (a worldbuilder gets no Book view, a writer no graph or maps), and can add starting pages: a "Start
  here" page, a book named after the world for writers, a Session template for game masters.
- **Settings → World profile** applies another profile at any time, without adding pages.

### Changed

- Settings are now kept for each world separately (in this browser): a novel and a campaign can have
  different parts switched on. Worlds without their own settings use the earlier, browser-wide ones.

## 0.16.0 — 2026-10-24

### Added

- **Books.** A new **Book** view for writing the story itself. A book is a page with `manuscript: true`
  whose text is its table of contents (`##` chapters, `- [[scene]]` lists), so it stays plain
  Markdown.
  - **Board**: chapters as columns and scenes as cards (status, point of view, year, summary, words);
    drag and drop or Alt+arrows to reorder, add scenes from the Scene template, add, rename and reorder
    chapters, take a scene out of the book.
  - **Read** the whole book straight through, and **download** it as one Markdown file.
  - Progress by status (Idea, Draft, Revised, Done) and word count for the book and each chapter.
- **Scene navigation**: a scene's page shows its book, chapter and position, Previous / Next scene, and
  status buttons.
- The Book view can be switched off in Settings.
- Demo world: the novel *The Silver Thread* with two chapters and four scenes.

## 0.15.1 — 2026-10-24

### Security

- The .zip library (fflate) is updated to 0.8.3: a deliberately broken archive could freeze the tab
  while opening (GHSA-px8p-9vwx-vf98). No data could leak; the tab just stopped responding.
- Opening a .zip now also checks how much actually came out of the archive, not only the sizes the
  archive claims, before anything is stored in the browser.

## 0.15.0 — 2026-10-24

### Added

- **What switching off affects.** In Settings, maps, years, the timeline and family trees say how many
  pages of the open world use them, with a list of those pages to open. When a part is off and pages
  still use it, the note turns red. Pages never change; only what is shown does.

## 0.14.0 — 2026-10-24

### Added

- **Areas on maps.** "Draw an area" (in Edit map) outlines a country, a forest, a flooded plain… by
  clicking its corners. Areas can link to a page (with its preview on hover), have a label, a colour
  (or the page's folder colour) and years, follow "Show by year", and be reshaped by dragging corners.
  They are stored in the page header as `regions:` with `points:` as fractions of the picture.
- **Map layers.** Pins and areas can be given a `layer` (Politics, Terrain, History…); the **Layers**
  menu above a map switches layers on and off, remembered per map in this browser.
- Demo world: the Silver Coast has four areas on three layers, including the lowlands of the Great Flood.

### Changed

- "Edit pins" is now "Edit map". Editing an area keeps comments and the rest of the header exactly as
  written.
- The language button in the sidebar is shorter (EN / RU), so the sidebar footer fits.

## 0.13.0 — 2026-10-23

### Added

- **Settings** (the gear at the bottom of the sidebar, or Ctrl+,): switch off the parts of the app you do
  not use — the Graph, Cards and Timeline views, family trees, interactive maps, years and "Show by
  year", the relations panel, previews on hover, word count, quick notes, focus mode, spell check — and
  choose the theme and language. Everything is on by default, so the demo shows it all; settings stay in
  this browser and "Turn everything back on" restores them.

## 0.12.0 — 2026-10-23

### Added

- **Family trees.** A "Family tree" tab in Cards draws the family of the selected character from their
  relations: up to great-grandparents, parents, full and half siblings, spouses, children and
  grandchildren, with pictures, years and joining lines. Clicking someone moves the tree to them;
  double-click opens the page. A tree button in the relations panel opens it for the current page.
- Family words are recognised in English and Russian (father, mother, son, daughter, spouse, brother,
  sister…); any relation type can be marked with `"family"` in the world settings.
- Demo world: Arn Vale's parents, Oren and Ysolde Vale, so the Vales have three generations.

### Changed

- The "Customizable workspace" idea on the roadmap now describes turning off views and tools one does
  not use.

## 0.11.0 — 2026-10-23

### Added

- **Page templates.** The new page dialog offers a template (Character, Place, Organization, Event,
  Scene; in Russian in the Russian interface) with header fields to fill and section headings, and
  suggests the folder for the page. Creating a page a link points to offers the same choice.
- Templates are pages in the world's `Templates/` (or `Шаблоны/`) folder, so they can be changed and new
  ones added; "Add them to the world" copies the built-in set there. `{{title}}` and `{{date}}` are
  filled in, and a `template:` header block (with `folder:`) is not copied into new pages.
- Template pages stay out of the graph, cards, timeline, tags, word counts and link resolution.

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
