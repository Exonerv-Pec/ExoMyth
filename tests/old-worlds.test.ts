/**
 * The promise of 1.0: worlds made by earlier versions still open and work. Every version of the demo
 * world in the project's history (read from git when the history is there) is opened and looked at
 * through every view the app has, then brought up to date.
 */
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { MemoryStorage } from '../src/core/storage';
import { Vault } from '../src/core/vault';
import { DEMO_FILES, updateDemoWorld } from '../src/demo';
import { renderMarkdown } from '../src/core/render';
import { buildGraph } from '../src/core/graph';
import { timelineModel, pageYears } from '../src/core/years';
import { dossier, folderTabs, folderCards } from '../src/core/cards';
import { familyTree, kinship } from '../src/core/family';
import { mapOf } from '../src/core/maps';
import { worldBooks, bookMarkdown } from '../src/core/manuscript';
import { boardOf } from '../src/core/board';
import { parsePlaylist } from '../src/core/playlist';
import { featureUsage } from '../src/core/usage';
import { worldCalendar, useCalendar } from '../src/core/calendar';

const git = (cmd: string) => execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] });

/** The commits that changed the demo, oldest first; none when the history is not available. */
function demoHistory(): string[] {
  try {
    if (git('rev-parse --is-shallow-repository').toString().trim() === 'true') return [];
    return git('log --reverse --format=%h -- examples/demo-world').toString().trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function demoAt(rev: string): Record<string, string> {
  const files = git(`ls-tree -r --name-only ${rev} -- examples/demo-world`).toString().trim().split('\n');
  const out: Record<string, string> = {};
  for (const f of files) {
    if (/\.(wav|mp3|ogg|png|jpe?g|webp)$/i.test(f)) continue;
    out[f.slice('examples/demo-world/'.length)] = git(`show "${rev}:${f}"`).toString();
  }
  return out;
}

const history = demoHistory();

describe('worlds from earlier versions', () => {
  it.skipIf(history.length === 0)('open, and every view works on them', async () => {
    expect(history.length).toBeGreaterThan(10);
    for (const rev of history) {
      const vault = await Vault.open(new MemoryStorage(`old-${rev}`, demoAt(rev)));
      const index = vault.index;
      expect(index.worldPages.length, rev).toBeGreaterThan(3);
      useCalendar(worldCalendar(index.worldPages));
      for (const page of index.pages) {
        expect(renderMarkdown(page.body, index), `${rev} ${page.path}`).toBeTypeOf('string');
        index.panel(page.path);
        pageYears(page);
        mapOf(page);
        boardOf(page);
        parsePlaylist(page.body);
        dossier(index, page.path);
      }
      buildGraph(index);
      timelineModel(index.worldPages);
      for (const tab of folderTabs(index)) folderCards(index, tab.folder);
      const kin = kinship(index);
      for (const page of index.worldPages) familyTree(index, page.path, kin);
      for (const book of worldBooks(index)) bookMarkdown(book, index);
      featureUsage(index);
    }
    useCalendar(undefined);
  }, 60_000);

  it.skipIf(history.length === 0)('are brought up to date without losing their own pages', async () => {
    for (const rev of history) {
      const storage = new MemoryStorage(`old-${rev}`, { ...demoAt(rev), 'Mine.md': 'My own page' });
      await updateDemoWorld(storage);
      expect(await storage.readText('Mine.md'), rev).toBe('My own page');
      // Every page of today's demo is there afterwards.
      for (const path of Object.keys(DEMO_FILES)) expect(await storage.exists(path), `${rev} ${path}`).toBe(true);
    }
  }, 60_000);
});
