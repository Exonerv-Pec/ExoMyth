import { describe, expect, it } from 'vitest';
import {
  acceptChange,
  addComment,
  addNote,
  changeNote,
  cleanText,
  clearDoneNotes,
  editComment,
  findMarks,
  rejectChange,
  removeNote,
  resolveComment,
  revisionCount,
  revisionNotes,
  setNoteDone,
  settleAll,
} from '../src/core/critic';
import { parsePage } from '../src/core/parse';
import { wordCount } from '../src/core/writing';
import { excerpt } from '../src/core/preview';

const raw = (text: string, m: { from: number; to: number }) => text.slice(m.from, m.to);

describe('comments in the text', () => {
  const text = '---\ntitle: Scene\n---\nArn entered {==the council hall==}{>>Too slow here?<<} and froze.{>>Check the year<<} Then {++quietly ++}he {--slowly --}sat {~~down~>back~~}.\n';

  it('finds comments and suggestions in reading order, with their places', () => {
    const marks = findMarks(text);
    expect(marks.map((m) => m.kind)).toEqual(['comment', 'comment', 'insert', 'delete', 'replace']);
    expect(marks[0]).toMatchObject({ text: 'the council hall', comment: 'Too slow here?' });
    expect(marks[1]).toMatchObject({ text: '', comment: 'Check the year' });
    expect(marks[2]!.after).toBe('quietly ');
    expect(marks[3]!.before).toBe('slowly ');
    expect(marks[4]).toMatchObject({ before: 'down', after: 'back' });
    expect(raw(text, marks[0]!)).toBe('{==the council hall==}{>>Too slow here?<<}');
  });

  it('ignores marks in the header, in code and across empty lines', () => {
    const t = '---\nnote: "{>>not a comment<<}"\n---\nUse `{>>code<<}` here.\n\n```\n{++block++}\n```\n\n{==one\n\ntwo==}';
    expect(findMarks(t)).toEqual([]);
  });

  it('a highlight without a comment is still a mark on the passage', () => {
    const [m] = findMarks('Look {==here==} now');
    expect(m).toMatchObject({ kind: 'comment', text: 'here', comment: '' });
  });

  it('cleanText keeps the passages and the text as it was before suggestions', () => {
    expect(cleanText('Arn entered {==the hall==}{>>slow<<} and froze. {>>year?<<} Then {++quietly ++}he {--slowly --}sat {~~down~>back~~}.')).toBe(
      'Arn entered the hall and froze. Then he slowly sat down.',
    );
    expect(cleanText('End of line {>>note<<}.')).toBe('End of line.');
    expect(cleanText('No marks at all')).toBe('No marks at all');
    expect(cleanText('Code `{>>stays<<}` here')).toBe('Code `{>>stays<<}` here');
  });

  it('word counts, previews and excerpts leave comments out', () => {
    expect(wordCount('One {==two==}{>>a long comment with many words<<} three {>>more words<<}')).toBe(3);
    expect(excerpt('First {>>hidden<<} paragraph.').markdown).toBe('First paragraph.');
  });

  it('resolving a comment keeps the passage; a point comment goes away with its space', () => {
    const marks = findMarks(text);
    const a = resolveComment(text, marks[0]!, raw(text, marks[0]!));
    expect(a).toContain('Arn entered the council hall and froze.');
    const b = resolveComment(a, findMarks(a)[0]!, raw(a, findMarks(a)[0]!));
    expect(b).toContain('and froze. Then');
  });

  it('accepts and rejects suggestions', () => {
    const marks = findMarks(text);
    let t = text;
    for (const m of [...marks].reverse()) if (m.kind !== 'comment') t = acceptChange(t, m, raw(text, m));
    expect(t).toContain('Then quietly he sat back.');
    let r = text;
    for (const m of [...marks].reverse()) if (m.kind !== 'comment') r = rejectChange(r, m, raw(text, m));
    expect(r).toContain('Then he slowly sat down.');
  });

  it('finds a mark that moved since it was listed', () => {
    const marks = findMarks(text);
    const moved = text.replace('Arn entered', 'Arn, tired, entered');
    expect(resolveComment(moved, marks[0]!, raw(text, marks[0]!))).toContain('entered the council hall and froze');
  });

  it('settles everything at once', () => {
    expect(settleAll(text, 'accept')).toContain('Arn entered the council hall and froze. Then quietly he sat back.');
    expect(settleAll(text, 'reject')).toContain('Then he slowly sat down.');
    expect(findMarks(settleAll(text, 'accept'))).toEqual([]);
  });

  it('adds a comment on a passage or at a point, never nesting marks', () => {
    const t = 'The river was cold.';
    const from = t.indexOf('river');
    expect(addComment(t, from, from + 5, 'Which river?').text).toBe('The {==river==}{>>Which river?<<} was cold.');
    // Spaces at the ends of a selection stay outside.
    expect(addComment(t, from - 1, from + 6, 'x').text).toBe('The {==river==}{>>x<<} was cold.');
    expect(addComment(t, t.length, t.length, 'End note').text).toBe('The river was cold.{>>End note<<}');
    const marked = 'A {==b==}{>>c<<} d';
    expect(addComment(marked, 3, 6, 'again').text).toBe('A {==b==}{>>c<<}{>>again<<} d');
    // Across paragraphs: a point comment after the selection.
    expect(addComment('one\n\ntwo', 0, 8, 'n').text).toBe('one\n\ntwo{>>n<<}');
    // An empty comment changes nothing; text that would close the mark early is made harmless.
    expect(addComment(t, 0, 3, '  ').text).toBe(t);
    expect(addComment(t, 0, 3, 'a <<} b\n\nc').text).toBe('{==The==}{>>a << } b\nc<<} river was cold.');
  });

  it('edits a comment, and an emptied comment is resolved', () => {
    const t = 'A {==b==}{>>c<<} d';
    const [m] = findMarks(t);
    expect(editComment(t, m!, raw(t, m!), 'new words')).toBe('A {==b==}{>>new words<<} d');
    expect(editComment(t, m!, raw(t, m!), '')).toBe('A b d');
  });
});

describe('revision notes', () => {
  const page = '---\ntitle: Duel\n# keep this comment\n---\nText\n';

  it('adds, ticks, changes and removes notes in the header, keeping YAML comments', () => {
    let t = addNote(page, 'Raise the stakes');
    t = addNote(t, '  Check   the flood year ');
    expect(t).toContain('# keep this comment');
    expect(revisionNotes(parsePage('a.md', t).frontmatter)).toEqual([
      { text: 'Raise the stakes', done: false },
      { text: 'Check the flood year', done: false },
    ]);
    t = setNoteDone(t, 1, true);
    expect(t).toContain('[x] Check the flood year');
    expect(revisionNotes(parsePage('a.md', t).frontmatter)[1]).toEqual({ text: 'Check the flood year', done: true });
    t = changeNote(t, 0, 'Raise the stakes earlier');
    expect(revisionNotes(parsePage('a.md', t).frontmatter)[0]!.text).toBe('Raise the stakes earlier');
    t = clearDoneNotes(t);
    expect(revisionNotes(parsePage('a.md', t).frontmatter)).toHaveLength(1);
    t = removeNote(t, 0);
    expect(t).not.toMatch(/^revision:/m);
    expect(t).toContain('# keep this comment');
    expect(t).toContain('Text');
  });

  it('reads notes written by hand', () => {
    expect(revisionNotes({ revision: ['One', '[x] Two', '[ ] Three', '', 4] })).toEqual([
      { text: 'One', done: false },
      { text: 'Two', done: true },
      { text: 'Three', done: false },
      { text: '4', done: false },
    ]);
    expect(revisionNotes({ revision: 'Just one' })).toEqual([{ text: 'Just one', done: false }]);
    expect(revisionNotes({})).toEqual([]);
  });

  it('counts open work on a page', () => {
    const p = parsePage('a.md', '---\nrevision:\n  - One\n  - "[x] Done"\n---\nA {==b==}{>>c<<} {++d++}\n');
    expect(revisionCount(p)).toEqual({ comments: 1, changes: 1, notes: 1 });
  });
});
