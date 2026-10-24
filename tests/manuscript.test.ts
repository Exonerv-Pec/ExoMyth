import { describe, expect, it } from 'vitest';
import { parsePage } from '../src/core/parse';
import { VaultIndex } from '../src/core/index';
import {
  addChapterToText,
  addSceneToText,
  bookMarkdown,
  isBook,
  moveChapterInText,
  moveSceneInText,
  parseBookText,
  removeSceneFromText,
  renameChapterInText,
  sceneInfo,
  scenePlace,
  statusOf,
  worldBooks,
} from '../src/core/manuscript';

const BOOK = `---
manuscript: true
---
# The Silver Thread

Notes for myself: keep it short.

## Chapter 1: The River
- [[Arrival]]
- [[The Market|Market day]]

## Chapter 2: The Siege

- [[Walls]]
1. [[Last Stand]]

### not a chapter
- [[Epilogue]]
`;

const scenes = (text: string) => parseBookText(text).map((c) => [c.title, c.scenes.map((s) => s.target)]);

describe('books', () => {
  it('reads chapters and scenes in order, keeping everything else', () => {
    expect(scenes(BOOK)).toEqual([
      ['Chapter 1: The River', ['Arrival', 'The Market']],
      ['Chapter 2: The Siege', ['Walls', 'Last Stand', 'Epilogue']],
    ]);
    expect(isBook(parsePage('b.md', BOOK, 1))).toBe(true);
    expect(isBook(parsePage('b.md', '---\nmanuscript: книга\n---\n', 1))).toBe(true);
    expect(isBook(parsePage('b.md', '# x', 1))).toBe(false);
    // Scenes before the first chapter go to an untitled one; code blocks are skipped.
    expect(scenes('- [[Prologue]]\n```\n- [[Not a scene]]\n```\n## One\n- [[A]]\n')).toEqual([
      ['', ['Prologue']],
      ['One', ['A']],
    ]);
  });

  it('moves scenes within and between chapters', () => {
    let t = moveSceneInText(BOOK, { c: 0, s: 0 }, { c: 0, s: 1 });
    expect(scenes(t)[0]).toEqual(['Chapter 1: The River', ['The Market', 'Arrival']]);
    t = moveSceneInText(BOOK, { c: 1, s: 1 }, { c: 0, s: 0 });
    expect(scenes(t)).toEqual([
      ['Chapter 1: The River', ['Last Stand', 'Arrival', 'The Market']],
      ['Chapter 2: The Siege', ['Walls', 'Epilogue']],
    ]);
    expect(t).toContain('1. [[Last Stand]]'); // the line moves as written
    expect(t).toContain('Notes for myself: keep it short.');
    // Into an empty chapter.
    const empty = addChapterToText(BOOK, 'Chapter 3');
    t = moveSceneInText(empty, { c: 0, s: 1 }, { c: 2, s: 0 });
    expect(scenes(t)[2]).toEqual(['Chapter 3', ['The Market']]);
    expect(t).toContain('## Chapter 3\n\n- [[The Market|Market day]]');
  });

  it('adds, renames, reorders chapters and removes scenes from the book', () => {
    let t = addSceneToText(BOOK, 0, 'New Scene');
    expect(scenes(t)[0]![1]).toEqual(['Arrival', 'The Market', 'New Scene']);
    t = addChapterToText(t, 'Chapter 3: Aftermath');
    t = addSceneToText(t, 2, 'Ashes');
    expect(scenes(t)[2]).toEqual(['Chapter 3: Aftermath', ['Ashes']]);
    expect(t.endsWith('## Chapter 3: Aftermath\n\n- [[Ashes]]\n')).toBe(true);
    t = renameChapterInText(t, 1, 'Chapter 2: Fire');
    expect(scenes(t)[1]![0]).toBe('Chapter 2: Fire');
    t = moveChapterInText(t, 2, 0);
    expect(scenes(t).map((c) => c[0])).toEqual(['Chapter 3: Aftermath', 'Chapter 1: The River', 'Chapter 2: Fire']);
    expect(t).toContain('# The Silver Thread\n\nNotes for myself: keep it short.\n\n## Chapter 3: Aftermath');
    t = removeSceneFromText(t, 0, 0);
    expect(scenes(t)[0]).toEqual(['Chapter 3: Aftermath', []]);
    expect(addSceneToText('---\nmanuscript: true\n---\n# Empty\n', 0, 'First')).toContain('- [[First]]');
  });

  it('keeps Windows line endings', () => {
    const t = moveSceneInText(BOOK.replace(/\n/g, '\r\n'), { c: 0, s: 0 }, { c: 1, s: 0 });
    expect(t).not.toMatch(/[^\r]\n/);
    expect(scenes(t)[1]![1]).toEqual(['Arrival', 'Walls', 'Last Stand', 'Epilogue']);
  });
});

describe('scenes', () => {
  const pages = [
    parsePage('Books/Silver Thread.md', BOOK, 1),
    parsePage('Scenes/Arrival.md', '---\nstatus: черновик\nrelations:\n  pov: "[[Kira|Kira Vale]]"\nyear: 430\n---\n# Arrival\n\nKira comes to [[Rivertown|the city]] at dawn.\n', 1),
    parsePage('Scenes/The Market.md', '---\nstatus: Done\npov: Bo\nsummary: Bo sells a map.\n---\nText of the market scene.\n', 1),
    parsePage('Scenes/Walls.md', '---\nstatus: someday\n---\nOn the walls. ||A secret||\n', 1),
  ];
  const index = new VaultIndex(pages);

  it('knows status, point of view, summary and words', () => {
    expect(statusOf('Draft')).toBe('draft');
    expect(statusOf('правка')).toBe('revised');
    expect(statusOf('maybe')).toBeUndefined();
    expect(sceneInfo(pages[1]!)).toEqual({ status: 'draft', pov: 'Kira Vale', summary: 'Kira comes to the city at dawn.', words: 8, year: '430' });
    expect(sceneInfo(pages[2]!)).toMatchObject({ status: 'done', pov: 'Bo', summary: 'Bo sells a map.' });
    expect(sceneInfo(pages[3]!)).toMatchObject({ statusText: 'someday' });
  });

  it('finds a scene in its book, with the scenes before and after', () => {
    const books = worldBooks(index);
    expect(books.map((b) => b.title)).toEqual(['The Silver Thread']);
    const place = scenePlace(books, 'Scenes/The Market.md')!;
    expect([place.chapter, place.position, place.total]).toEqual([0, 1, 5]);
    expect(place.prev?.target).toBe('Arrival');
    expect(place.next?.target).toBe('Walls');
    expect(scenePlace(books, 'Nowhere.md')).toBeUndefined();
  });

  it('exports the whole book as one text, links as plain words', () => {
    const md = bookMarkdown(worldBooks(index)[0]!, index, { sceneTitles: true });
    expect(md).toBe(
      [
        '# The Silver Thread',
        '',
        '## Chapter 1: The River',
        '',
        '### Arrival',
        '',
        'Kira comes to the city at dawn.',
        '',
        '### The Market',
        '',
        'Text of the market scene.',
        '',
        '## Chapter 2: The Siege',
        '',
        '### Walls',
        '',
        'On the walls. A secret',
        '',
        '### Last Stand',
        '',
        '### Epilogue',
        '',
      ].join('\n'),
    );
    expect(bookMarkdown(worldBooks(index)[0]!, index)).not.toContain('###');
  });
});
