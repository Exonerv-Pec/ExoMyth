import { describe, expect, it } from 'vitest';
import { parsePage } from '../src/core/parse';
import { VaultIndex } from '../src/core/index';
import { addPin, changePin, existsIn, mapOf, removePin, yearSpan } from '../src/core/maps';

const MAP = `---
# The coast as Tomas drew it
map: "[[coast.png]]"
pins:
  - page: "[[Rivertown]]"
    x: 0.42
    y: 0.63
    from: 300
  - label: Old Watchtower
    x: 0.8
    y: "0.2"
    from: 210
    to: 405
  - page: Nowhere
    x: 2
    y: -1
  - label: broken
    x: left
---
The coast.
`;

describe('maps', () => {
  it('reads the image, pins, labels and years; clamps positions and skips broken pins', () => {
    const m = mapOf(parsePage('Maps/Coast.md', MAP, 1))!;
    expect(m.image).toBe('coast.png');
    expect(m.pins).toEqual([
      { index: 0, page: 'Rivertown', x: 0.42, y: 0.63, from: 300 },
      { index: 1, label: 'Old Watchtower', x: 0.8, y: 0.2, from: 210, to: 405 },
      { index: 2, page: 'Nowhere', x: 1, y: 0 },
    ]);
    expect(mapOf(parsePage('A.md', 'not a map', 1))).toBeUndefined();
  });

  it('tells which pins exist in a year', () => {
    const pins = mapOf(parsePage('C.md', MAP, 1))!.pins;
    expect(pins.filter((p) => existsIn(p, 250)).map((p) => p.index)).toEqual([1, 2]);
    expect(pins.filter((p) => existsIn(p, 400)).map((p) => p.index)).toEqual([0, 1, 2]);
    expect(pins.filter((p) => existsIn(p, 405)).map((p) => p.index)).toEqual([0, 1, 2]);
    expect(pins.filter((p) => existsIn(p, 406)).map((p) => p.index)).toEqual([0, 2]);
    expect(yearSpan(pins)).toEqual({ min: 210, max: 405 });
    expect(yearSpan([])).toBeUndefined();
  });

  it('adds, moves, edits and removes pins while keeping the rest of the header', () => {
    let text = '---\n# keep me\nmap: coast.png\ntags: [map]\n---\nBody\n';
    text = addPin(text, { page: 'Rivertown', x: 0.123456, y: 0.5 });
    text = addPin(text, { label: 'Ruins', x: 0.9, y: 0.1, from: 100 });
    expect(text).toContain('# keep me');
    expect(text).toContain('tags: [map]'); // untouched fields keep their look
    expect(text.endsWith('---\nBody\n')).toBe(true);
    let m = mapOf(parsePage('C.md', text, 1))!;
    expect(m.pins).toEqual([
      { index: 0, page: 'Rivertown', x: 0.1235, y: 0.5 },
      { index: 1, label: 'Ruins', x: 0.9, y: 0.1, from: 100 },
    ]);
    text = changePin(text, 0, { x: 0.3, y: 0.7, to: 500 });
    text = changePin(text, 1, { from: undefined, page: 'Old Watchtower' });
    m = mapOf(parsePage('C.md', text, 1))!;
    expect(m.pins).toEqual([
      { index: 0, page: 'Rivertown', x: 0.3, y: 0.7, to: 500 },
      { index: 1, page: 'Old Watchtower', label: 'Ruins', x: 0.9, y: 0.1 },
    ]);
    text = removePin(text, 0);
    text = removePin(text, 0);
    expect(text).not.toContain('pins');
    expect(mapOf(parsePage('C.md', text, 1))!.pins).toEqual([]);
  });

  it('counts pinned pages as links, so they show up in backlinks and on the graph', () => {
    const idx = new VaultIndex([parsePage('Maps/Coast.md', MAP, 1), parsePage('Rivertown.md', '', 1)]);
    expect(idx.backlinkPaths('Rivertown.md')).toEqual(['Maps/Coast.md']);
  });
});
