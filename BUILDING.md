# Building Exomyth

[Русская версия](BUILDING.ru.md)

This guide is for people who want to run Exomyth from the source code, change it, or publish their
own copy. To simply use the app, open **https://exonerv-pec.github.io/Exomyth/** — nothing to install.

## What you need

- **Node.js 20 or newer** (22 recommended): <https://nodejs.org>. It includes `npm`.
- **Git**, to download the code: <https://git-scm.com>. (Or use "Code → Download ZIP" on GitHub.)
- A recent **Chrome, Edge or Opera** to work with world folders. Firefox and Safari work too, but
  keep worlds in the browser only.

Check the versions in a terminal:

```bash
node --version   # v20 or higher
npm --version
```

## 1. Get the code

```bash
git clone https://github.com/Exonerv-Pec/Exomyth.git
cd Exomyth
```

## 2. Install the dependencies

```bash
npm install
```

This downloads the libraries listed in `package.json` into `node_modules/` (about 100 MB). It is only
needed once, and again after `package.json` changes.

## 3. Run the app while developing

```bash
npm run dev
```

Open the address it prints, usually <http://localhost:5173>. The page reloads by itself when you change
a file. Stop the server with `Ctrl+C`.

## 4. Check your changes

```bash
npm run check   # type and Svelte checks
npm test        # unit and interface tests
```

Both must pass before a change is merged; the GitHub deploy runs them too and stops if they fail.

## 5. Build the finished app

```bash
npm run build
```

The ready-to-host app is written to `dist/`. Look at it locally with:

```bash
npm run preview   # serves dist/ at http://localhost:4173
```

Opening `dist/index.html` straight from the disk does **not** work: browsers do not run the app's
module scripts from `file://` addresses. Use `npm run preview` or any static web server.

The build also writes `dist/sw.js`, which keeps the app for working offline. It runs only over
`https://` or on `localhost`, so after `npm run preview` the browser keeps that copy too: when you
build again, the page shows **Reload** to take the new one (or clear the site's data in the browser).
The dev server (`npm run dev`) never uses it.

There is also a single-file build, used for previews:

```bash
npm run build:single   # writes dist-single/index.html with everything inlined
```

## 6. Publishing with GitHub Pages

The repository publishes itself. The workflow in `.github/workflows/pages.yml` runs on every push to
`main`:

1. installs the dependencies (`npm ci`),
2. runs `npm run check` and `npm test`,
3. builds the app (`npm run build`),
4. publishes `dist/` to GitHub Pages.

The site only delivers the app to the browser. Worlds stay on each person's device; the app sends
nothing anywhere, and its Content Security Policy blocks network requests.

GitHub Pages and GitHub Actions are free for public repositories on standard GitHub-hosted runners.

### Publishing your own copy (fork)

1. On GitHub, press **Fork** on the Exomyth repository.
2. In your fork: **Settings → Pages → Source: GitHub Actions**.
3. Push a commit to `main` (or open **Actions → Deploy to GitHub Pages → Run workflow**).
4. After a few minutes the app is at `https://<your-user-name>.github.io/Exomyth/`.

Your fork is under the same AGPL-3.0 license: if you publish a changed version, its source must stay
open. See [LICENSE-NOTE.md](LICENSE-NOTE.md).

## Troubleshooting

| Problem | What to do |
| --- | --- |
| `npm install` fails or `npm run dev` shows syntax errors | Your Node.js is too old. Install version 20 or newer. |
| The deploy job stays "Queued" for a long time | Open **Actions**, cancel the run and press **Re-run all jobs**. Check that **Settings → Pages → Source** is **GitHub Actions**. |
| The deploy fails with a Pages error | In **Settings → Environments → github-pages**, allow deployments from the `main` branch. |
| A blank page after opening `dist/index.html` from the disk | Expected; use `npm run preview` (see step 5). |
| "Open a world folder" is missing | The browser does not support folder access (Firefox, Safari) or the app is shown inside another page. Use Chrome, Edge or Opera, and open the app directly. |
| Tests fail after you changed the demo world | `tests/demo.test.ts` checks that the demo has no broken links. Fix the link or add the missing page. |

## Where things are

```
src/core/         logic without interface: parsing, links, relations panel, graph layout,
                  page previews, media, storage, world operations
src/components/   the interface (Svelte 5)
src/i18n.ts       interface text in Russian and English
examples/         the demo world, bundled into the app
tests/            automated tests (Vitest)
.github/          the GitHub Pages workflow
```

More about the rules for contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
