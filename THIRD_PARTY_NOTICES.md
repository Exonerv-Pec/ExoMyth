# Third-party software

The Exomyth application bundles the following open-source libraries. Each is used under its own
license, all of which allow use in an AGPL-3.0 project. Their full license texts are included in
their packages under `node_modules/<package>/LICENSE` after `npm install`.

| Package | License | Used for |
| --- | --- | --- |
| [Svelte](https://github.com/sveltejs/svelte) (runtime) | MIT | Interface framework |
| [CodeMirror 6](https://github.com/codemirror) (`@codemirror/*`, `@lezer/*`, `style-mod`, `w3c-keyname`, `crelt`, `@marijn/find-cluster-break`) | MIT | Text editor |
| [marked](https://github.com/markedjs/marked) | MIT | Markdown rendering |
| [DOMPurify](https://github.com/cure53/DOMPurify) | Apache-2.0 (dual-licensed MPL-2.0 OR Apache-2.0; used under Apache-2.0) | Cleaning rendered HTML |
| [yaml](https://github.com/eemeli/yaml) | ISC | Reading and editing page headers |
| [fflate](https://github.com/101arrowz/fflate) | MIT | Saving and opening worlds as .zip files |
| [esm-env](https://github.com/benmccann/esm-env), [clsx](https://github.com/lukeed/clsx) | MIT | Svelte runtime helpers |

Development-only tools (Vite, Vitest, TypeScript, svelte-check, jsdom, vite-plugin-singlefile) are
not part of the built application.

No code, artwork, icons or text from other note-taking or worldbuilding products is included. See
the clean-room rule in [CONTRIBUTING.md](CONTRIBUTING.md).
