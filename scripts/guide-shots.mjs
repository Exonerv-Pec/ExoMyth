// Makes the pictures of the guide (docs/GUIDE.md, docs/GUIDE.ru.md) from the demo world, in the dark
// theme, in English and in Russian, as WebP files in public/guide/<lang>/<topic>.webp.
//
//   npm run guide:shots              builds the app, then takes every picture
//   npm run guide:shots -- graph     only the topics named
//
// Needs Playwright with Chromium (npx playwright install chromium). Nothing leaves this computer: the
// app is served from the local build, and the pictures are encoded by the same browser.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { preview } from 'vite';

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const want = (id) => only.length === 0 || only.includes(id);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try {
    // A Playwright installed for the whole machine (found through NODE_PATH, which import ignores).
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    console.error('Playwright is needed for the guide pictures: npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }
}

if (!process.argv.includes('--no-build')) execSync('npx vite build', { stdio: 'inherit' });
const server = await preview({ preview: { port: 4317, strictPort: false, open: false }, logLevel: 'warn' });
const base = server.resolvedUrls.local[0];

/** What the buttons are called, so they can be found in each language. */
const LABELS = {
  en: { demo: 'Open the demo world', site: 'Site for readers', editing: 'Editing', closeEditing: 'Close editing', compare: 'Compare', stats: 'Writing stats', newPage: 'New page', family: 'Family tree' },
  ru: { demo: 'Открыть демо-мир', site: 'Сайт для читателей', editing: 'Правка', closeEditing: 'Закрыть правку', compare: 'Сравнить', stats: 'Статистика письма', newPage: 'Новая страница', family: 'Семейное древо' },
};
const MODES = ['edit', 'split', 'preview', 'graph', 'cards', 'timeline', 'book'];

const browser = await chromium.launch();
const made = [];
try {
  for (const lang of ['en', 'ru']) {
    const L = LABELS[lang];
    const out = `public/guide/${lang}`;
    mkdirSync(out, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark', deviceScaleFactor: 1 });
    await context.addInitScript((l) => {
      try {
        if (!localStorage.getItem('guide-shots')) {
          localStorage.setItem('guide-shots', '1');
          localStorage.setItem('exomyth:lang', l);
          localStorage.setItem('exomyth:theme', 'dark');
          localStorage.setItem('exomyth:tour', 'done'); // the tour would cover the pictures
        }
      } catch {
        /* A page without storage keeps the defaults. */
      }
    }, lang);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    const wait = (ms) => page.waitForTimeout(ms);
    /** Saves the window as a WebP picture, encoded by the browser itself. */
    const shot = async (id) => {
      if (!want(id)) return;
      await wait(400);
      const png = await page.screenshot();
      const webp = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        return canvas.toDataURL('image/webp', 0.8).split(',')[1];
      }, png.toString('base64'));
      const file = `${out}/${id}.webp`;
      writeFileSync(file, Buffer.from(webp, 'base64'));
      made.push(file);
    };
    const mode = async (m) => {
      await page.locator('.topbar .seg button').nth(MODES.indexOf(m)).click();
      await wait(300);
    };
    const open = async (name) => {
      // The whole name, so "Rivertown" is not "The Look of Rivertown".
      const exact = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
      await page.locator('.sidebar .tree-item', { hasText: exact }).first().click();
      await wait(400);
    };
    const escape = async () => {
      await page.keyboard.press('Escape');
      await wait(200);
    };

    await page.goto(base);
    await wait(600);
    await shot('start');
    await page.getByRole('button', { name: L.demo }).click();
    await page.waitForSelector('.workspace');
    await wait(800);

    await open('Kira Vale');
    await mode('split');
    await shot('pages');
    await mode('preview');
    await shot('relations');

    await page.keyboard.press('Control+k');
    await wait(200);
    await page.keyboard.type('river');
    await page.keyboard.press('ArrowDown');
    await shot('lookup');
    await escape();

    await mode('graph');
    await wait(1500);
    await shot('graph');

    await mode('cards');
    await open('Order of the Silver River');
    await shot('cards');
    await open('Kira Vale');
    await page.getByRole('tab', { name: L.family }).click();
    await wait(500);
    await shot('family');

    await mode('preview');
    await open('Silver Coast');
    await wait(800);
    await shot('maps');

    await mode('timeline');
    await wait(800);
    await shot('timeline');

    await mode('preview');
    await open('Calendar of the Coast');
    await wait(500);
    await shot('calendar');

    await mode('book');
    await wait(600);
    await shot('book');

    await mode('preview');
    await page.locator(`.sidebar button[aria-label="${L.newPage}"]`).first().click();
    await wait(300);
    await shot('projects');
    await escape();

    await open('The Market');
    await page.locator(`.topbar button[aria-label="${L.editing}"]`).click();
    await wait(600);
    await shot('editing');
    await page.locator('.rev-versions li').first().getByRole('button', { name: L.compare, exact: true }).click();
    await wait(600);
    await shot('versions');
    await escape();
    await page.locator(`.revpanel button[aria-label="${L.closeEditing}"]`).click();
    await wait(200);

    await open('The Look of Rivertown');
    await wait(1200);
    await shot('boards');

    await open('Rivertown Evening');
    await wait(500);
    await shot('playlists');

    await open('Rivertown');
    await wait(800);
    await shot('media');

    await open('The Walls');
    await mode('edit');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n\nArn climbed the stairs. The wind had turned, and the fires on the plain leaned east.');
    await wait(1500);
    await page.keyboard.press('Control+.');
    await wait(500);
    await shot('writing');
    await escape();

    await page.locator(`.topbar button[aria-label="${L.stats}"]`).click();
    await wait(300);
    await page.locator('#stats-goal').fill('500');
    await page.locator('#stats-goal').dispatchEvent('change');
    await wait(300);
    await shot('stats');
    await escape();

    await mode('preview');
    await page.locator(`.sidebar button[aria-label="${L.site}"]`).click();
    await wait(300);
    await shot('site');
    await escape();

    await page.keyboard.press('Control+,');
    await wait(300);
    await shot('settings');
    await escape();

    await page.keyboard.press('Control+/');
    await wait(300);
    await shot('shortcuts');
    await escape();

    if (errors.length) console.warn(`${lang}: errors in the page:\n${errors.join('\n')}`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`${made.length} pictures:\n${made.join('\n')}`);
