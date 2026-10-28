# The Exomyth file format

Version 1. [Русская версия](FORMAT.ru.md)

A world is a folder. Everything in it is a plain file that any editor can read: Markdown pages with a
YAML header, ordinary pictures and sounds, and a few small JSON files that Exomyth keeps for itself.
This page lists everything Exomyth reads and writes, so a world can be made, changed or read by other
programs and by hand.

## What 1.0 promises

From version 1.0 on, for every 1.x version of Exomyth:

- **A world keeps working.** Every page, header field and file described here means the same in all
  later 1.x versions. Nothing is renamed, nothing changes meaning, nothing is dropped.
- **New things are added, never swapped in.** A new feature gets new header fields or new files.
  Pages that do not use it are not touched.
- **Edits stay small.** When Exomyth changes a header, it changes only the field it needs and keeps
  your other fields, their order and your comments. It never rewrites a page it was not asked to
  change.
- **Worlds from 0.x open.** Worlds made by earlier versions open as they are, including those kept
  under the project's earlier name (`.mythloom/`).
- **Nothing is erased.** Deleted pages go to `.trash/` in the world; versions are kept in
  `.exomyth/versions/`.

A change that would break any of this would need Exomyth 2.0, and the notes of that release would say
how to carry a world over.

## The folder

```
My world/
  Welcome.md                    pages, in any folders you like
  Characters/Kira Vale.md
  attachments/rivertown.png     pictures, video and sound (new files go here)
  Templates/Character.md        your own page templates (or Шаблоны/)
  .exomyth/settings.json        relation types of the world
  .exomyth/graph.json           where pages sit in the graph
  .exomyth/writing.json         words and time per day
  .exomyth/versions/…           saved versions of pages
  .trash/…                      deleted pages
```

Pages are every `.md` file outside `.exomyth/`. The folders `.git`, `.trash`, `.obsidian` and
`node_modules` are never read as part of the world.

## Pages

A page is a `.md` file in UTF-8. Its name is the file name without `.md`. An optional header between
`---` lines at the very top is YAML.

### Links and marks in the text

| Written | Meaning |
| --- | --- |
| `[[Page]]`, `[[Page\|text]]`, `[[Page#Heading]]` | A link, by page name, alias or the end of a path; with shown text or a heading |
| `![[file.png]]`, `![[file.png\|400]]`, `![[file.png\|A caption]]` | A picture, video or sound file of the world; a width, or a caption |
| `![[Page]]` | A link to a page, shown as a link |
| `#tag` | A tag |
| `\|\|words\|\|` | A spoiler, hidden until clicked |
| `{==words==}{>>comment<<}`, `{>>comment<<}` | A comment on words, or at one point (CriticMarkup) |
| `{>>comment<<}{>>reply<<}` | Comments right after a comment are replies to it |
| `{++added++}`, `{--removed--}`, `{~~old~>new~~}` | Suggested changes |

A link finds the page with that name, or else the page with that alias; a link with a `/` in it
finds the page whose path ends with it. Upper and lower case do not matter, and when two pages
share a name the one in the shallower folder wins. Links inside code are not links.

### Header fields

| Field | Value | Meaning |
| --- | --- | --- |
| `title` | text | The page's title, when it should differ from the file name |
| `aliases` | list | Other names links can use |
| `tags` | list | Tags (as well as `#tag` in the text) |
| `relations` | map: type → link or list of links | Typed relations: `father: "[[Arn Vale]]"` |
| `pinned` | list of links | Relations shown first in their group |
| `image` | file | The page's picture, on its infobox and card |
| `born`, `died`, `founded`, `from`, `to`, `year`, `years` and the like | year or date | When the page's subject lived or happened (see Dates) |
| `map` | file | Makes the page a map of that picture |
| `pins`, `regions` | list | Pins and areas on the map (see Maps) |
| `manuscript: true` | | Makes the page a book (see Books) |
| `status`, `pov`, `summary` | text | A scene's progress (`idea`, `draft`, `revised`, `done`), point of view and summary |
| `playlist: true` | | Makes the page a playlist of the audio files it lists |
| `moodboard: true`, `board` | list | Makes the page a mood board (see Mood boards) |
| `calendar: true`, `months`, `week`, `eras` | | Makes the page the world's calendar (see Dates) |
| `revision` | list of text | Notes on what to fix; `[x]` in front of the ones that are done |
| `template` | map | Only in templates: `folder:` says where new pages of the kind go; not copied |
| anything else | text, number, list | A fact, shown in the page's infobox |

`true` can also be written `yes` or `да`.

### Dates

The start of a page is read from `from`, `born`, `founded`, `built`, `established`, `formed`,
`began`, `start` (and `родился`, `основан`…), its end from `to`, `died`, `dissolved`, `destroyed`,
`fell`, `abandoned`, `ended`, `end` (and `умер`, `разрушен`…), and a single point or a span from
`year`, `years` (`год`, `годы`). A value is a year (`412`, `-50`) or a date: `3 Frostmonth 412`,
`Frostmonth 412`, `412-01-03`, `412 AR`, `Year 112 of the Second Age`, and spans like
`28 Leaffall 429 – Thaw 430`.

The world's calendar is its first page with `calendar: true`:

```yaml
calendar: true
months:
  - Frostmonth: 30        # a month and its days
  - name: Thaw
    days: 28
  - Seedtime              # 30 days when not said
week: [Moonday, Tideday, Stoneday, Fireday, Restday]
eras:
  - name: Age of the River
    short: AR
    start: 1              # the year, counted from the start of time, that is year 1 of the era
```

Without one, years have the twelve months of the common calendar.

### Maps

```yaml
map: silver coast.svg
pins:
  - page: "[[Rivertown]]"     # or label: Old Watchtower
    x: 0.42                    # fractions of the picture: 0 is left or top, 1 right or bottom
    y: 0.63
    from: 300                  # optional years it exists in
    to: 450
    layer: Politics            # optional
regions:
  - page: "[[Lands of the Order]]"
    color: "#a86214"
    points: [[0.1, 0.2], [0.4, 0.2], [0.3, 0.5]]
```

### Books

A page with `manuscript: true` is a book. Its `##` headings are chapters, and the links in list items
under them are its scenes, in order:

```markdown
## Chapter 1: The River
- [[Arrival at Rivertown]]
- [[The Market]]
```

Everything else in the book page is kept exactly as written.

### Mood boards

```yaml
moodboard: true
board:
  - image: storm coast.jpg     # x, y, w (and h) in widths of the board
    caption: Where it starts
    x: 0.05
    y: 0.04
    w: 0.4
  - color: "#a86214"
  - quote: The sea keeps what it is given.
    source: Old saying
  - page: "[[Rivertown]]"
  - note: Wet stone, gulls.
    tint: "#f3e3a1"
```

### Playlists

A page with `playlist: true` plays the audio files of its list items in order:
`- ![[Fiddle in the rain.mp3]]`, `- ![[Last call.ogg|Last call, slow]]`.

## Files of the app

`.exomyth/settings.json`: the relation types of the world, in the order the panel shows them.

```json
{ "relationTypes": [ { "id": "father", "inverse": "children" }, { "id": "ally", "symmetric": true } ] }
```

A type can also say `"family": "parent" | "child" | "spouse" | "sibling" | "none"` for family trees.

`.exomyth/graph.json`: where each page sits in the graph. Deleting it only gives a new layout.

`.exomyth/writing.json`: words added and seconds written per day, and the daily goal.

`.exomyth/versions/<page path>/<date> <time>[ <name>].md`: saved versions of a page, each a full copy
of the page as it was.

`.trash/<page path>`: deleted pages.

## Templates

Pages in `Templates/` (or `Шаблоны/`) at the top of the world are templates, not part of the world:
`{{title}}` and `{{date}}` are filled in for a new page.
