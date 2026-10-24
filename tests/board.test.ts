import { describe, expect, it } from 'vitest';
import { parsePage } from '../src/core/parse';
import {
  addItem,
  boardHeight,
  boardOf,
  changeItem,
  cleanColor,
  estimatedHeight,
  isBoard,
  itemCount,
  nextSpot,
  removeItem,
  splitQuote,
} from '../src/core/board';

const page = (text: string) => parsePage('Boards/Storm.md', text, 1);

const BOARD = `---
# the look of the coast
moodboard: true
board:
  - image: storm coast.jpg   # the cliffs
    caption: Where it starts
    x: 0.05
    y: 0.04
    w: 0.4
  - color: "#A86214"
    x: 0.5
    y: 0.04
    w: 0.12
    h: 0.1
    caption: Rust
  - quote: |
      The sea keeps what it is given.
      Nothing more.
    source: Old saying
    x: 0.5
    y: 0.25
    w: 0.3
  - page: "[[Kira Vale]]"
    x: 0.1
    y: 0.5
    w: 0.2
---
Notes for the look of the coast.
`;

describe('boards', () => {
  it('are pages whose header says moodboard', () => {
    expect(isBoard(page('---\nmoodboard: true\n---\n'))).toBe(true);
    expect(isBoard(page('---\nmoodboard: yes\n---\n'))).toBe(true);
    expect(isBoard(page('---\nmoodboard: да\n---\n'))).toBe(true);
    expect(isBoard(page('---\nmoodboard: false\n---\n'))).toBe(false);
    expect(isBoard(page('---\nboard:\n  - quote: x\n---\n'))).toBe(false);
    expect(isBoard(page('No header'))).toBe(false);
    expect(boardOf(page('# Plain'))).toBeUndefined();
    expect(boardOf(page('---\nmoodboard: true\n---\n'))).toEqual({ items: [] });
  });

  it('read pictures, colours, quotes and page cards, in the order they were pinned', () => {
    const model = boardOf(page(BOARD))!;
    expect(model.items.map((i) => i.kind)).toEqual(['image', 'color', 'quote', 'page']);
    expect(model.items[0]).toEqual({ index: 0, kind: 'image', image: 'storm coast.jpg', caption: 'Where it starts', x: 0.05, y: 0.04, w: 0.4 });
    expect(model.items[1]).toEqual({ index: 1, kind: 'color', color: '#a86214', caption: 'Rust', x: 0.5, y: 0.04, w: 0.12, h: 0.1 });
    expect(model.items[2]).toMatchObject({ kind: 'quote', quote: 'The sea keeps what it is given.\nNothing more.\n'.trim(), source: 'Old saying' });
    expect(model.items[3]).toMatchObject({ kind: 'page', page: 'Kira Vale', w: 0.2 });
    expect(itemCount(page(BOARD))).toBe(4);
  });

  it('accept an image written as an embed, and a page written with or without brackets', () => {
    const m = boardOf(page('---\nmoodboard: true\nboard:\n  - image: "![[a b.png|x]]"\n  - page: Kira\n---\n'))!;
    expect(m.items[0]).toMatchObject({ kind: 'image', image: 'a b.png' });
    expect(m.items[1]).toMatchObject({ kind: 'page', page: 'Kira' });
  });

  it('skip what cannot be shown and keep indexes honest, so edits hit the right entry', () => {
    const p = page('---\nmoodboard: true\nboard:\n  - nothing: here\n  - 7\n  - quote: Kept\n    x: 0.2\n---\n');
    const m = boardOf(p)!;
    expect(m.items).toHaveLength(1);
    // The scalar `7` is not an entry; the unreadable first entry still counts, the quote is the third... of two entries.
    expect(m.items[0]!.index).toBe(1);
    expect(itemCount(p)).toBe(2);
    expect(boardOf(page('---\nmoodboard: true\nboard: nope\n---\n'))).toEqual({ items: [] });
  });

  it('keep every position and size inside the board', () => {
    const m = boardOf(page('---\nmoodboard: true\nboard:\n  - quote: A\n    x: -3\n    y: 99\n    w: 7\n  - color: "#fff"\n    x: "0.9"\n    w: 0.5\n    h: 50\n  - quote: B\n    w: 0.001\n---\n'))!;
    expect(m.items[0]).toMatchObject({ x: 0, y: 8, w: 1 });
    expect(m.items[1]).toMatchObject({ x: 0.5, w: 0.5, h: 2 });
    expect(m.items[2]!.w).toBe(0.06);
  });

  it('only take colours that are plain hex, never anything that could reach a style', () => {
    expect(cleanColor('#A86214')).toBe('#a86214');
    expect(cleanColor(' #fff ')).toBe('#fff');
    for (const bad of ['red', 'url(x)', '#12', '#12345', '#gggggg', 'rgb(1,2,3)', '#fff;background:url(x)', 5, undefined, '']) expect(cleanColor(bad)).toBeUndefined();
    expect(boardOf(page('---\nmoodboard: true\nboard:\n  - color: "red; background: url(//x)"\n    x: 0.1\n---\n'))!.items).toEqual([]);
  });

  it('draw tall enough for the lowest item, never shorter than the minimum', () => {
    expect(boardHeight([])).toBe(0.6);
    const m = boardOf(page(BOARD))!;
    expect(boardHeight(m.items)).toBe(0.65); // the page card at y 0.5 and about 0.1 tall, plus the margin
    expect(boardHeight(m.items, new Map([[3, 0.4]]))).toBe(0.95);
    expect(estimatedHeight(m.items[1]!)).toBe(0.1);
    expect(estimatedHeight(m.items[0]!)).toBeCloseTo(0.3);
  });

  it('put new items a step apart', () => {
    expect(nextSpot(0)).toEqual({ x: 0.04, y: 0.04 });
    expect(nextSpot(3)).toEqual({ x: 0.16, y: 0.16 });
    expect(nextSpot(8)).toEqual(nextSpot(0));
  });
});

describe('editing a board', () => {
  it('pins a new item on top and makes the page a board, keeping the header as written', () => {
    const out = addItem(BOARD, { kind: 'quote', quote: 'Hello', x: 0.3, y: 0.7, w: 0.25 });
    expect(out).toContain('# the look of the coast');
    expect(out).toContain('# the cliffs');
    expect(out.endsWith('Notes for the look of the coast.\n')).toBe(true);
    const m = boardOf(page(out))!;
    expect(m.items).toHaveLength(5);
    expect(m.items[4]).toMatchObject({ kind: 'quote', quote: 'Hello', x: 0.3, y: 0.7, w: 0.25 });

    const fresh = addItem('# Plain\n\nText.\n', { kind: 'color', color: '#1F7A6D', x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
    expect(fresh.startsWith('---\nmoodboard: true\nboard:\n')).toBe(true);
    expect(boardOf(page(fresh))!.items[0]).toMatchObject({ kind: 'color', color: '#1f7a6d', h: 0.2 });
    expect(fresh.endsWith('# Plain\n\nText.\n')).toBe(true);
  });

  it('leaves out what an item does not need, and ignores an empty or invalid one', () => {
    const out = addItem('---\nmoodboard: true\n---\n', { kind: 'image', image: ' sea.png ', x: 0.1, y: 0.1, w: 0.3, caption: '  ', source: 'ignored', h: 0.5 });
    expect(out).toContain('image: sea.png');
    expect(out).not.toMatch(/caption|source|\bh:/);
    const bad = addItem('---\nmoodboard: true\n---\n', { kind: 'color', color: 'red', x: 0, y: 0, w: 0.2 });
    expect(boardOf(page(bad))!.items).toEqual([]);
  });

  it('moves and resizes one item and changes nothing else', () => {
    const out = changeItem(BOARD, 0, { x: 0.2, y: 0.3 });
    expect(out).toContain('# the cliffs');
    const before = boardOf(page(BOARD))!.items;
    const after = boardOf(page(out))!.items;
    expect(after[0]).toEqual({ ...before[0]!, x: 0.2, y: 0.3 });
    expect(after.slice(1)).toEqual(before.slice(1));
    // Moved too far right: it stays on the board.
    expect(boardOf(page(changeItem(BOARD, 0, { x: 5 })))!.items[0]!.x).toBe(0.6);
    // A wider item is pulled back so it does not leave the board.
    expect(boardOf(page(changeItem(BOARD, 1, { w: 0.8 })))!.items[1]).toMatchObject({ x: 0.2, w: 0.8, h: 0.1 });
  });

  it('changes the words and the colour, and removes a field set to nothing', () => {
    let out = changeItem(BOARD, 0, { caption: 'Windy' });
    expect(boardOf(page(out))!.items[0]!.caption).toBe('Windy');
    out = changeItem(out, 0, { caption: undefined });
    expect(boardOf(page(out))!.items[0]!.caption).toBeUndefined();
    out = changeItem(out, 1, { color: '#00FF00', h: 0.3 });
    expect(boardOf(page(out))!.items[1]).toMatchObject({ color: '#00ff00', h: 0.3 });
    // An invalid colour changes nothing.
    expect(boardOf(page(changeItem(out, 1, { color: 'red' })))!.items[1]!.color).toBe('#00ff00');
    out = changeItem(out, 3, { page: 'Arn Vale' });
    expect(out).toContain('page: "[[Arn Vale]]"');
    expect(boardOf(page(out))!.items[3]!.page).toBe('Arn Vale');
    out = changeItem(out, 2, { quote: 'New words', source: undefined });
    expect(boardOf(page(out))!.items[2]).toMatchObject({ quote: 'New words' });
    expect(boardOf(page(out))!.items[2]!.source).toBeUndefined();
  });

  it('lifts an item to the top when asked', () => {
    const out = changeItem(BOARD, 0, { x: 0.1 }, true);
    expect(boardOf(page(out))!.items.map((i) => i.kind)).toEqual(['color', 'quote', 'page', 'image']);
    // Already on top: nothing moves.
    expect(boardOf(page(changeItem(out, 3, { x: 0.2 }, true)))!.items.map((i) => i.kind)).toEqual(['color', 'quote', 'page', 'image']);
  });

  it('removes an item, and the board list with the last one', () => {
    const out = removeItem(BOARD, 1);
    expect(boardOf(page(out))!.items.map((i) => i.kind)).toEqual(['image', 'quote', 'page']);
    expect(out).toContain('# the look of the coast');
    let rest = out;
    for (let i = 0; i < 3; i++) rest = removeItem(rest, 0);
    expect(rest).not.toMatch(/^board:/m);
    expect(rest).toContain('moodboard: true');
    expect(boardOf(page(rest))).toEqual({ items: [] });
    // An index that is not there changes nothing.
    expect(boardOf(page(removeItem(BOARD, 9)))).toEqual(boardOf(page(BOARD)));
    expect(boardOf(page(changeItem(BOARD, 9, { x: 0.1 })))).toEqual(boardOf(page(BOARD)));
  });

  it('refuses a header that is not a list of fields, instead of overwriting it', () => {
    expect(() => addItem('---\n- just\n- a list\n---\n', { kind: 'quote', quote: 'x', x: 0, y: 0, w: 0.2 })).toThrow();
  });
});

describe('quotes typed in one box', () => {
  it('take a last line that starts with a dash as the source', () => {
    expect(splitQuote('Be water.\n— Someone')).toEqual({ quote: 'Be water.', source: 'Someone' });
    expect(splitQuote('Line one\nLine two\n-- A. Nonymous')).toEqual({ quote: 'Line one\nLine two', source: 'A. Nonymous' });
    expect(splitQuote('  Just words  ')).toEqual({ quote: 'Just words' });
    expect(splitQuote('- a list item')).toEqual({ quote: '- a list item' });
  });
});
