import { describe, expect, it } from 'vitest';
import {
  acceptChange,
  addComment,
  addReply,
  editReply,
  suggestEdit,
  type SuggestedEdit,
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


describe('replies under a comment', () => {
  const t = 'A {==b==}{>>Why?<<}{>>Because.<<} c {>>alone<<} d';

  it('reads comments right after a comment as its replies', () => {
    const marks = findMarks(t);
    expect(marks).toHaveLength(2);
    expect(marks[0]).toMatchObject({ text: 'b', comment: 'Why?', replies: ['Because.'] });
    expect(marks[1]).toMatchObject({ comment: 'alone', replies: [] });
    expect(cleanText(t)).toBe('A b c d');
  });

  it('adds, edits and removes replies; resolving takes the whole thread', () => {
    const [m] = findMarks(t);
    const r = (s: string) => s.slice(findMarks(s)[0]!.from, findMarks(s)[0]!.to);
    let s = addReply(t, m!, r(t), 'Still unsure');
    expect(s).toContain('{==b==}{>>Why?<<}{>>Because.<<}{>>Still unsure<<} c');
    s = editReply(s, findMarks(s)[0]!, r(s), 0, 'Because of the tide.');
    expect(findMarks(s)[0]!.replies).toEqual(['Because of the tide.', 'Still unsure']);
    s = editReply(s, findMarks(s)[0]!, r(s), 1, '');
    expect(findMarks(s)[0]!.replies).toEqual(['Because of the tide.']);
    // Editing the comment keeps the replies.
    s = editComment(s, findMarks(s)[0]!, r(s), 'Why so?');
    expect(s).toContain('{==b==}{>>Why so?<<}{>>Because of the tide.<<} c');
    s = resolveComment(s, findMarks(s)[0]!, r(s));
    expect(s).toBe('A b c {>>alone<<} d');
    // A reply to a passage that has no comment yet becomes its comment.
    expect(addReply('x {==y==} z', findMarks('x {==y==} z')[0]!, '{==y==}', 'Note')).toBe('x {==y==}{>>Note<<} z');
  });
});

describe('suggesting changes', () => {
  /** Applies an edit the way the editor would, or the plain change when it goes through as it is. */
  function type(text: string, cursor: number, insert: string): { text: string; cursor: number } {
    const e = suggestEdit(text, cursor, cursor, insert);
    if (!e) return { text: text.slice(0, cursor) + insert + text.slice(cursor), cursor: cursor + insert.length };
    return { text: text.slice(0, e.from) + e.insert + text.slice(e.to), cursor: e.cursor };
  }
  function del(text: string, from: number, to: number, direction: 'backward' | 'forward' | 'none', insert = ''): { text: string; cursor: number } {
    const e: SuggestedEdit | undefined = suggestEdit(text, from, to, insert, direction);
    if (!e) return { text: text.slice(0, from) + insert + text.slice(to), cursor: from + insert.length };
    return { text: text.slice(0, e.from) + e.insert + text.slice(e.to), cursor: e.cursor };
  }
  const backspace = (s: { text: string; cursor: number }) => del(s.text, s.cursor - 1, s.cursor, 'backward');
  const forward = (s: { text: string; cursor: number }) => del(s.text, s.cursor, s.cursor + 1, 'forward');

  it('wraps new words, and keeps typing inside one addition', () => {
    let s = type('The sea.', 4, 'grey');
    expect(s).toEqual({ text: 'The {++grey++}sea.', cursor: 11 });
    s = type(s.text, s.cursor, ' ');
    expect(s.text).toBe('The {++grey ++}sea.');
    // Right after an addition (cursor moved past it): it continues.
    s = type(s.text, s.text.indexOf('sea'), 'x');
    expect(s.text).toBe('The {++grey x++}sea.');
  });

  it('keeps removed letters as a removal, joining them while Backspace goes on', () => {
    let s = { text: 'The old sea.', cursor: 7 };
    s = backspace(s);
    expect(s).toEqual({ text: 'The ol{--d--} sea.', cursor: 6 });
    s = backspace(s);
    s = backspace(s);
    expect(s).toEqual({ text: 'The {--old--} sea.', cursor: 4 });
    // Backspace with the cursor after the removal: the letter before it joins.
    s = backspace({ text: s.text, cursor: s.text.indexOf('--}') + 3 });
    expect(s.text).toBe('The{-- old--} sea.');
  });

  it('removes forward with Delete, and over a selection', () => {
    let s = forward({ text: 'abc', cursor: 0 });
    expect(s).toEqual({ text: '{--a--}bc', cursor: 7 });
    s = forward(s);
    expect(s.text).toBe('{--ab--}c');
    const sel = del('The old sea.', 4, 7, 'none');
    expect(sel.text).toBe('The {--old--} sea.');
  });

  it('typing over a selection removes it and adds the new words after', () => {
    const s = del('The old sea.', 4, 7, 'none', 'grey');
    expect(s.text).toBe('The {--old--}{++grey++} sea.');
    expect(s.cursor).toBe(s.text.indexOf('++} sea'));
  });

  it("removes one's own suggested words for good", () => {
    let s = { text: 'a {++xy++} b', cursor: 7 };
    s = backspace(s);
    expect(s.text).toBe('a {++x++} b');
    s = backspace(s);
    expect(s.text).toBe('a  b');
  });

  it('keeps empty lines out of marks, and leaves comments and the header alone', () => {
    expect(del('one\n\ntwo', 1, 7, 'none').text).toBe('o{--ne--}\n\n{--tw--}o');
    expect(suggestEdit('---\ntitle: X\n---\nText', 5, 5, 'a')).toBeUndefined();
    expect(suggestEdit('Text', 4, 4, '\n')).toBeUndefined();
    const c = 'A {>>note<<} b';
    expect(suggestEdit(c, 6, 6, 'x')).toBeUndefined();
    // A selection over a comment marks the words around it and keeps the comment.
    expect(del(c, 0, c.length, 'none').text).toBe('{--A --}{>>note<<}{-- b--}');
  });

  it('a new line inside an addition ends it first', () => {
    const s = type('a {++xy++} b', 7, '\n');
    expect(s.text).toBe('a {++xy++}\n b');
  });
});

describe('comments from the reading view', () => {
  it('finds a selected passage in the text, across emphasis and links', async () => {
    const { findPassage, occurrences } = await import('../src/core/critic');
    const t = '---\ntitle: X\n---\nArn met **old** [[Kira Vale|Kira]] by the river. The river was cold.';
    const at = (r: { from: number; to: number } | undefined) => (r ? t.slice(r.from, r.to) : undefined);
    expect(at(findPassage(t, 'old Kira by'))).toBe('old** [[Kira Vale|Kira]] by');
    // Inside a link: the whole link.
    expect(at(findPassage(t, 'Kira'))).toBe('[[Kira Vale|Kira]]');
    // The second "river".
    expect(at(findPassage(t, 'river', 1))).toBe('river');
    expect(findPassage(t, 'river', 1)!.from).toBe(t.lastIndexOf('river'));
    expect(findPassage(t, 'nowhere')).toBeUndefined();
    expect(findPassage(t, 'X')).toBeUndefined(); // not in the header
    expect(occurrences('the river and the  river', 'the river')).toBe(2);
    expect(occurrences('abc', '')).toBe(0);
  });
});
