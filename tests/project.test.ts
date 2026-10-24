import { describe, expect, it } from 'vitest';
import { projectFiles, projectName, projectPage } from '../src/core/project';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { isBook as isManuscript } from '../src/core/manuscript';
import { isPlaylist, parsePlaylist } from '../src/core/playlist';

describe('story project files', () => {
  it('make an overview and a page in each of 8 numbered folders, named after the story', () => {
    const files = projectFiles('Ember Sea', 'en');
    expect(files).toHaveLength(9);
    expect(files[0]!.path).toBe('Ember Sea/Ember Sea.md');
    expect(files.slice(1).map((f) => f.path)).toEqual([
      'Ember Sea/1 Brainstorm/Ember Sea — Ideas.md',
      'Ember Sea/2 Outline/Ember Sea — Outline.md',
      'Ember Sea/3 Drafts/Ember Sea — Draft.md',
      'Ember Sea/4 Story bible/Ember Sea — Story bible.md',
      'Ember Sea/5 Art/Ember Sea — Art.md',
      'Ember Sea/6 Research/Ember Sea — Research.md',
      'Ember Sea/7 Notes/Ember Sea — Notes.md',
      'Ember Sea/8 Playlist/Ember Sea — Playlist.md',
    ]);
    expect(files.map((f) => f.path)).toEqual([...new Set(files.map((f) => f.path))]);
  });

  it('come in Russian too', () => {
    const files = projectFiles('Тихое море', 'ru');
    expect(files[1]!.path).toBe('Тихое море/1 Мозговой штурм/Тихое море — Идеи.md');
    expect(files[8]!.path).toBe('Тихое море/8 Плейлист/Тихое море — Плейлист.md');
    expect(files[0]!.text).toContain('[[Тихое море — Библия]]');
  });

  it('link every page from the overview, and every link finds its page', async () => {
    for (const lang of ['en', 'ru'] as const) {
      const files = projectFiles('Ember Sea', lang);
      const vault = await Vault.open(new MemoryStorage(`p-${lang}`, Object.fromEntries(files.map((f) => [f.path, f.text]))));
      expect(vault.pages).toHaveLength(9);
      expect(vault.index.brokenLinks()).toEqual([]);
      const overview = vault.getPage('Ember Sea/Ember Sea.md')!;
      expect(overview.mentions).toHaveLength(8);
    }
  });

  it('make the Drafts page a book and the Playlist page a playlist that starts empty', async () => {
    const files = projectFiles('Ember Sea', 'en');
    const vault = await Vault.open(new MemoryStorage('p-kinds', Object.fromEntries(files.map((f) => [f.path, f.text]))));
    const kinds = (suffix: string) => vault.pages.find((p) => p.path.endsWith(suffix))!;
    expect(isManuscript(kinds('Draft.md'))).toBe(true);
    expect(isPlaylist(kinds('Playlist.md'))).toBe(true);
    expect(vault.pages.filter(isManuscript)).toHaveLength(1);
    expect(vault.pages.filter(isPlaylist)).toHaveLength(1);
    expect(parsePlaylist(kinds('Playlist.md').body)).toEqual([]);
  });

  it('can be made twice in one world, because every page carries the story name', () => {
    const a = projectFiles('One', 'en').map((f) => f.path.split('/').pop());
    const b = projectFiles('Two', 'en').map((f) => f.path.split('/').pop());
    expect(a.filter((n) => b.includes(n))).toEqual([]);
  });
});

describe('the story name', () => {
  it('is made safe as a folder and page name', () => {
    expect(projectName('  Ember / Sea  ')).toBe('Ember Sea');
    expect(projectName('What: now?')).toBe('What now');
    expect(projectName('[[x]]#')).toBe('x');
    expect(projectName('///')).toBe('');
    expect(projectPage('Ember Sea', 'Ideas')).toBe('Ember Sea — Ideas');
  });
});
