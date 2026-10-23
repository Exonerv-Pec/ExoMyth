# Contributing to Exomyth

Thank you for helping. Exomyth is open source under the AGPL-3.0 and is written from scratch.
To keep it that way, every contribution follows the rules below.

## Clean-room rule

Exomyth implements ideas that many tools share (wiki links, backlinks, a graph of pages, hover
previews). Ideas and general techniques are free to use. Other people's **code, text, artwork and
trademarks** are not.

When you contribute:

1. **Write the code yourself.** Do not copy, translate or closely paraphrase source code from
   other note-taking or worldbuilding apps (for example Obsidian, World Anvil, Chronicler,
   LegendKeeper, Campfire, Notion, Logseq), from their plugins, or from decompiled or minified
   bundles. This applies whether or not that code is publicly visible.
2. **Do not look at a competitor's code while working on the same feature.** Work from the
   behaviour you want (described in your own words in an issue) and from general sources:
   textbooks, papers, MDN, the documentation of the libraries we use.
3. **Reuse open-source code only when its license allows it in an AGPL-3.0 project** (MIT, ISC,
   BSD, Apache-2.0, MPL-2.0, LGPL, GPL-3.0, AGPL-3.0 and similar). Keep its copyright notice,
   name it in the pull request, and add it to [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
   Code without a license, or under a "non-commercial", "source-available" or proprietary license
   (for example PolyForm), cannot be used.
4. **No borrowed assets or branding.** Icons, fonts, images, colour themes and interface text must
   be original or openly licensed. Do not use other products' names or logos in the interface,
   except to describe compatibility in plain words (for example "opens folders of Markdown files
   created in other apps").
5. **AI-generated code** is welcome under the same rules: you are responsible for checking that it
   does not reproduce someone else's code, and for testing it.

If you are unsure whether something is allowed, ask in an issue before writing it.

### How existing features were built

- **Relations graph layout** (`src/core/layout.ts`): an original implementation of the general
  force-directed idea from graph-drawing literature (pages connected by springs, all pages pushing
  each other apart, step sizes that shrink over a fixed number of rounds), with Exomyth's own
  rules for stability: saved positions, placing new pages next to their neighbours, a shelf for
  unconnected pages, and fixed folder colours.
- **Hover previews** (`src/core/preview.ts`, `src/components/HoverPreview.svelte`): written from a
  plain description of the behaviour (show the opening of the linked page, or the linked section).
- **Hashing** uses 32-bit FNV-1a, a public-domain algorithm.

## Working on the code

```bash
npm install
npm run dev     # http://localhost:5173
npm run check   # types and Svelte checks
npm test        # unit and interface tests
```

- Keep `src/core` free of interface and network code; it must stay testable without a browser.
- Add tests for behaviour you change. The stability of the relations panel and of the graph
  layout is covered by tests; changes must keep them passing.
- The app must never make network requests. The production build ships a Content Security Policy
  that blocks them, so a change that needs the network will not work.
- Interface text lives in `src/i18n.ts`; add every new string in Russian and English.
- The demo world is `examples/demo-world/`. Edit those files directly; the app picks them up.
  When you change an existing demo file, add the fingerprint of its old text (`contentHash` in
  `src/core/hash.ts`) to `DEMO_HISTORY` in `src/demo.ts`, so demos saved by earlier versions are
  updated when untouched.

## Sign-off

By sending a pull request you confirm that you wrote the contribution yourself (or that it comes
from a source whose license allows it, as described above) and that you agree to publish it under
the AGPL-3.0.

