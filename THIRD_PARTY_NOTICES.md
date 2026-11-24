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

### Exomyth for the desktop

The desktop app (`src-tauri/`) adds the following, compiled into the program. Every Rust crate it
uses is under a licence that allows use in an AGPL-3.0 project (mostly MIT and Apache-2.0, some ISC,
BSD, Zlib, MPL-2.0, Unicode-3.0 and CDLA-Permissive-2.0); `cargo metadata` in `src-tauri/` lists them
all with their licences.

| Package | License | Used for |
| --- | --- | --- |
| [Tauri](https://github.com/tauri-apps/tauri) (`tauri`, `@tauri-apps/api`, `tauri-plugin-dialog`, `tauri-plugin-opener`) | MIT OR Apache-2.0 | The window, folder and save dialogs, opening links in the browser |
| [ureq](https://github.com/algesten/ureq) with [rustls](https://github.com/rustls/rustls) and [rustls-platform-verifier](https://github.com/rustls/rustls-platform-verifier) | MIT OR Apache-2.0 (rustls also ISC) | The "Check for updates" request, checked with the system's certificates |
| [webpki-roots](https://github.com/rustls/webpki-roots) | CDLA-Permissive-2.0 | Certificate authorities for that request |
| [serde](https://github.com/serde-rs/serde), [serde_json](https://github.com/serde-rs/json), [percent-encoding](https://github.com/servo/rust-url) | MIT OR Apache-2.0 | Reading and writing the list of folders |

On Windows the window is drawn by Microsoft Edge WebView2, which is part of Windows.

Development-only tools (Vite, Vitest, TypeScript, svelte-check, jsdom, vite-plugin-singlefile) are
not part of the built application.

No code, artwork, icons or text from other note-taking or worldbuilding products is included. See
the clean-room rule in [CONTRIBUTING.md](CONTRIBUTING.md).
