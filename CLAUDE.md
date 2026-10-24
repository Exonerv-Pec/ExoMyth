# Notes for AI coding assistants

Exomyth is a private, offline-first wiki for writers and worldbuilders. Worlds are folders of plain
Markdown pages with YAML headers. Read [README.md](README.md), [ROADMAP.md](ROADMAP.md),
[CHANGELOG.md](CHANGELOG.md) and [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything.

## Rules that never bend

- **Private by design.** The app never makes network requests: no servers, accounts, analytics or
  remote fonts. The build ships a Content Security Policy (`default-src 'self'`) that blocks them.
- **Plain files.** Everything a world holds stays readable Markdown, YAML or normal media files.
  When the app edits a YAML header, it changes only the part it needs and keeps the user's comments.
- **Clean room.** Write the code yourself. Never copy or closely paraphrase code from Obsidian,
  World Anvil, LegendKeeper or similar apps. Third-party code is allowed only under an
  AGPL-compatible licence and must be listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **Safe rendering.** Markdown goes through the sanitizer (`marked` + DOMPurify). Never insert raw
  HTML from a page. Validate any value from a page that ends up in styles or attributes, such as
  colours.

## Stack and layout

- Svelte 5 (runes), TypeScript, Vite 7, Vitest with jsdom, CodeMirror 6.
- `src/core/`: pure logic without interface or network code, tested without a browser.
- `src/components/`: the interface. App state lives in `src/app.svelte.ts`.
- `src/i18n.ts`: all interface text. Add every new string in both English and Russian.
- `examples/demo-world/`: the demo world, also used by the tests.
- `VaultIndex.pages` holds every page. `VaultIndex.worldPages` leaves out templates, and world views
  (graph, cards, timeline, word count, links) use it.

## Before every commit

```bash
npm run check   # types and Svelte checks, must report 0 errors
npm test        # all tests must pass
npm run build
```

- Check interface changes in a real browser (Chromium with Playwright) at desktop and phone width,
  in both themes. Stop any dev or preview server when you are done.
- Tests count demo pages, graph nodes and the like. When the demo world grows, update those numbers.

## When adding or changing things

- **New features** get a switch in Settings (`FEATURES` in `src/app.svelte.ts`) if a user might not
  want them. Say in `src/core/usage.ts` which pages use the feature, and decide which start profiles
  (`src/core/profiles.ts`) turn it on.
- **Changing an existing demo file:** add the `contentHash` of its old text to `DEMO_HISTORY` in
  `src/demo.ts`, so demos saved by earlier versions update when the user has not touched them.
- **Every release:** bump the version in `package.json` and add an entry to `CHANGELOG.md`. Add a row
  to Done in `ROADMAP.md` and update or remove the idea it came from. Describe new features in
  `README.md` and `README.ru.md`.
- Keep ideas in `ROADMAP.md` even when they look hard. The notes say what would make them fit.

## Repository

- `main` is protected. Changes come in as pull requests and need the "Type check, tests, build"
  check to pass.
- Every push to `main` deploys the site to GitHub Pages (`.github/workflows/pages.yml`). After
  pushing, check that the deploy succeeded.
- The licence is AGPL-3.0. Do not add a dependency with an incompatible licence.
