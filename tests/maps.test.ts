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

import { addRegion, changeRegion, mapLayers, regionCentre, removeRegion } from '../src/core/maps';
import { worldYearSpan } from '../src/core/years';

describe('map regions and layers', () => {
  const MAPR = `---
map: coast.png
pins:
  - label: Tower
    x: 0.3
    y: 0.3
    layer: History
regions:
  # the old kingdom
  - label: Kingdom
    layer: Politics
    color: "#2f63a8"
    from: 300
    points: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5], [0.1, 0.5]]
  - page: "[[Westwood]]"
    layer: Terrain
    color: blue
    points: [[0, 0], [0.2, 0]]
  - label: Marsh
    points: [[0.6, 0.6], [0.9, 0.6], [0.8, "0.9"], [2, -1]]
---
Body
`;

  it('reads regions with their page, label, layer, colour and years; skips broken ones', () => {
    const m = mapOf(parsePage('Maps/Coast.md', MAPR, 1))!;
    expect(m.regions.map((r) => [r.index, r.label ?? r.page, r.layer, r.color, r.points.length])).toEqual([
      [0, 'Kingdom', 'Politics', '#2f63a8', 4],
      [2, 'Marsh', undefined, undefined, 4],
    ]);
    expect(m.regions[1]!.points[3]).toEqual([1, 0]); // clamped onto the picture
    expect(m.pins[0]!.layer).toBe('History');
    expect(mapLayers(m)).toEqual(['History', 'Politics']);
    const [cx, cy] = regionCentre(m.regions[0]!.points);
    expect(cx).toBeCloseTo(0.3);
    expect(cy).toBeCloseTo(0.3);
    expect(worldYearSpan([parsePage('Maps/Coast.md', MAPR, 1)])).toEqual({ min: 300, max: 300 });
  });

  it('adds, changes and removes regions, keeping the rest of the header', () => {
    let text = addRegion(MAPR, { label: 'Order lands', layer: 'Politics', points: [[0.5, 0.4], [0.7, 0.4], [0.123456, 0.6]], from: 371 });
    expect(text).toContain('# the old kingdom');
    expect(text).toContain('points: [[0.5, 0.4], [0.7, 0.4], [0.1235, 0.6]]');
    let m = mapOf(parsePage('M.md', text, 1))!;
    expect(m.regions.map((r) => r.label)).toEqual(['Kingdom', 'Marsh', 'Order lands']);
    // Index 3 among entries: the Westwood region with too few points still counts in the file.
    text = changeRegion(text, 3, { page: 'Order of the Silver River', color: '#a86214', layer: undefined });
    expect(text).toContain('color: blue'); // other regions are left exactly as written
    m = mapOf(parsePage('M.md', text, 1))!;
    const order = m.regions.find((r) => r.index === 3)!;
    expect([order.page, order.color, order.layer, order.from]).toEqual(['Order of the Silver River', '#a86214', undefined, 371]);
    text = removeRegion(text, 0);
    m = mapOf(parsePage('M.md', text, 1))!;
    expect(m.regions.map((r) => r.label ?? r.page)).toEqual(['Marsh', 'Order lands']);
    expect(m.pins.length).toBe(1);
    expect(removeRegion(removeRegion(removeRegion(text, 0), 0), 0)).not.toContain('regions:');
  });

  it('pins keep their layer when moved, and lose it when cleared', () => {
    let text = changePin(MAPR, 0, { x: 0.4 });
    expect(mapOf(parsePage('M.md', text, 1))!.pins[0]!.layer).toBe('History');
    text = changePin(text, 0, { layer: undefined });
    expect(mapOf(parsePage('M.md', text, 1))!.pins[0]!.layer).toBeUndefined();
  });
});
