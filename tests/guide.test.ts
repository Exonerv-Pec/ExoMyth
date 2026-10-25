import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseGuide, parseTry, topicMatches } from '../src/core/guide';
import { FEATURES } from '../src/app.svelte';
import { DEMO_FILES } from '../src/demo';

const en = parseGuide(readFileSync('docs/GUIDE.md', 'utf8'));
const ru = parseGuide(readFileSync('docs/GUIDE.ru.md', 'utf8'));

describe('the guide', () => {
  it('reads topics with their comment, picture and text', () => {
    const t = parseGuide('# G\n\nIntro\n\n## Graph\n<!-- guide: graph | feature: graph | try: mode:graph -->\n\n![The graph](../public/guide/en/graph.webp)\n\nText **here**.\n\n## No comment\n\nSkipped.\n');
    expect(t).toEqual([{ id: 'graph', title: 'Graph', feature: 'graph', try: { kind: 'mode', mode: 'graph' }, image: { file: 'graph.webp', alt: 'The graph' }, body: 'Text **here**.' }]);
  });

  it('reads what Try it does', () => {
    expect(parseTry('open:Scenes/The Market.md+revision')).toEqual({ kind: 'open', path: 'Scenes/The Market.md', panel: 'revision' });
    expect(parseTry('open:Maps/Silver Coast.md')).toEqual({ kind: 'open', path: 'Maps/Silver Coast.md' });
    expect(parseTry('lookup')).toEqual({ kind: 'action', name: 'lookup' });
    expect(parseTry('')).toBeUndefined();
  });

  it('has the same topics in English and Russian, in the same order, with the same actions', () => {
    expect(en.length).toBeGreaterThanOrEqual(20);
    expect(ru.map((t) => t.id)).toEqual(en.map((t) => t.id));
    expect(ru.map((t) => [t.feature, t.try])).toEqual(en.map((t) => [t.feature, t.try]));
    expect(new Set(en.map((t) => t.id)).size).toBe(en.length);
  });

  it('names only real parts of Settings, real views and pages of the demo world', () => {
    const actions = ['lookup', 'family', 'newPage', 'focus', 'stats', 'settings', 'shortcuts'];
    for (const t of en) {
      if (t.feature) expect(FEATURES as readonly string[], t.id).toContain(t.feature);
      if (t.try?.kind === 'mode') expect(['edit', 'split', 'preview', 'graph', 'cards', 'timeline', 'book'], t.id).toContain(t.try.mode);
      if (t.try?.kind === 'open') expect(Object.keys(DEMO_FILES), t.id).toContain(t.try.path);
      if (t.try?.kind === 'action') expect(actions, t.id).toContain(t.try.name);
    }
  });

  it('has a picture for every topic, in both languages, once they have been made', () => {
    for (const [lang, topics] of [['en', en], ['ru', ru]] as const) {
      for (const t of topics) {
        expect(t.image?.file, `${lang} ${t.id}`).toBe(`${t.id}.webp`);
        expect(existsSync(`public/guide/${lang}/${t.id}.webp`), `${lang}/${t.id}.webp`).toBe(true);
      }
    }
  });

  it('finds topics by words in their title or text', () => {
    const graph = en.find((t) => t.id === 'graph')!;
    expect(topicMatches(graph, 'lay out')).toBe(true);
    expect(topicMatches(graph, 'GRAPH zoom')).toBe(true);
    expect(topicMatches(graph, 'playlist')).toBe(false);
    expect(topicMatches(graph, '  ')).toBe(true);
  });
});
