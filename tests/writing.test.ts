// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appendIdea, stamp, wordCount } from '../src/core/writing';
import { countWords } from '../src/i18n';

describe('word count', () => {
  it('counts the words a reader sees, in any language', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('Kira left Rivertown in 430.')).toBe(5);
    expect(wordCount('Кира покинула Ривертаун, не оглядываясь.')).toBe(5);
    expect(wordCount("It's [[Arn Vale|the old king]]'s sword")).toBe(5);
    expect(wordCount('See [[Rivertown#Harbour]] and [the map](https://example.com/a-b-c).')).toBe(5);
    expect(wordCount('![[map.png|400]] ![alt text](pic.png) # Title')).toBe(1);
  });

  it('says it naturally in both languages', () => {
    expect(countWords('en', 1)).toBe('1 word');
    expect(countWords('en', 1234)).toBe('1,234 words');
    expect(['1 слово', '2 слова', '5 слов', '11 слов', '21 слово', '22 слова', '112 слов'].map((s) => s)).toEqual(
      [1, 2, 5, 11, 21, 22, 112].map((n) => countWords('ru', n)),
    );
  });
});

describe('ideas inbox', () => {
  const when = new Date(2026, 9, 23, 21, 5);

  it('stamps ideas with the local date and time', () => {
    expect(stamp(when)).toBe('2026-10-23 21:05');
  });

  it('adds ideas to the end of the page as one list', () => {
    let text = '# Inbox\n\nQuick notes.\n';
    text = appendIdea(text, 'A dragon that hoards maps', when);
    expect(text).toBe('# Inbox\n\nQuick notes.\n\n- **2026-10-23 21:05** — A dragon that hoards maps\n');
    text = appendIdea(text, '  Eva knew all along\n\nShe saw the letter.  ', when);
    expect(text).toBe(
      '# Inbox\n\nQuick notes.\n\n- **2026-10-23 21:05** — A dragon that hoards maps\n- **2026-10-23 21:05** — Eva knew all along\n\n  She saw the letter.\n',
    );
  });

  it('keeps Windows line endings', () => {
    expect(appendIdea('# Inbox\r\n', 'x', when)).toBe('# Inbox\r\n\r\n- **2026-10-23 21:05** — x\r\n');
  });
});
