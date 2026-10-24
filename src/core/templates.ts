/**
 * Page templates. A template is an ordinary page in the world's `Templates/` folder (`Шаблоны/` works
 * too), so writers can change them or add their own like any other page. Until a world has its own,
 * Exomyth offers a built-in set.
 *
 * In a template:
 * - `{{title}}` becomes the new page's name and `{{date}}` today's date (YYYY-MM-DD);
 * - a `template:` block in the header is only for the template and is not copied. Its `folder:`
 *   says where new pages of this kind go:
 *
 *     template:
 *       folder: Characters
 *
 * Template pages are not part of the world itself: they are left out of the graph, cards, timeline,
 * tags and word counts, and links never point to them.
 */
import type { Page } from './types';
import { compareText } from './names';
import { structureTemplateFiles } from './structures';

export const TEMPLATE_DIRS = ['Templates', 'Шаблоны'];

/** Whether a path lies in a templates folder at the top of the world. */
export function isTemplatePath(path: string): boolean {
  const top = path.includes('/') ? path.slice(0, path.indexOf('/')).toLocaleLowerCase() : '';
  return TEMPLATE_DIRS.some((d) => d.toLocaleLowerCase() === top);
}

export interface TemplateChoice {
  /** Name shown in the list (the template page's title, or the built-in's name). */
  name: string;
  /** Text of the template, as written. */
  text: string;
  /** Path of the template page, when it comes from the world. */
  path?: string;
  /** Folder new pages go to, from `template: folder:`. */
  folder?: string;
  /** The Settings switch a built-in template belongs to; it is not offered while that is off. */
  feature?: string;
  /** A group the New page window shows apart from the rest, from `template: group:` (`structure`). */
  group?: string;
}

/** The templates of a world (pages in its templates folder), by name. */
export function worldTemplates(pages: readonly Page[]): TemplateChoice[] {
  return pages
    .filter((p) => isTemplatePath(p.path))
    .map((p) => {
      const t: TemplateChoice = { name: p.title, text: p.raw, path: p.path };
      const folder = templateFolder(p.raw);
      if (folder) t.folder = folder;
      const group = templateGroup(p.raw);
      if (group) t.group = group;
      return t;
    })
    .sort((a, b) => compareText(a.name, b.name));
}

const HEADER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Lines of the `template:` block in a header (the key line and its indented lines). */
function templateBlock(header: string): { start: number; end: number } | undefined {
  const lines = header.split('\n');
  const start = lines.findIndex((l) => /^template:\s*(#.*)?$/.test(l.replace(/\r$/, '')));
  if (start === -1) return undefined;
  let end = start + 1;
  while (end < lines.length && (/^[ \t]+\S/.test(lines[end]!) || /^\s*$/.test(lines[end]!))) end++;
  // Blank lines at the end belong to whatever follows.
  while (end > start + 1 && /^\s*$/.test(lines[end - 1]!)) end--;
  return { start, end };
}

/** A field of the `template:` block in a header (`folder`, `group`), if it says. */
function templateField(text: string, key: string): string | undefined {
  const m = HEADER.exec(text);
  if (!m) return undefined;
  const header = m[1]!;
  const block = templateBlock(header);
  if (!block) return undefined;
  const line = new RegExp(`^[ \\t]+${key}:[ \\t]*(.*?)[ \\t]*(?:#.*)?\\r?$`);
  for (const l of header.split('\n').slice(block.start + 1, block.end)) {
    const f = line.exec(l);
    if (f) {
      const value = f[1]!.replace(/^["']|["']$/g, '').trim();
      return value || undefined;
    }
  }
  return undefined;
}

/** The folder a template sends new pages to (`template: folder:`), if it says. */
export function templateFolder(text: string): string | undefined {
  return templateField(text, 'folder');
}

/** The group a template is shown in (`template: group:`), if it says. */
export function templateGroup(text: string): string | undefined {
  return templateField(text, 'group');
}

function today(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * The text of a new page made from a template: placeholders filled in and the `template:` block
 * left out. Everything else (comments, empty fields to fill, headings) is kept exactly.
 */
export function applyTemplate(text: string, values: { title: string; date?: Date }): string {
  let out = text;
  const m = HEADER.exec(out);
  if (m) {
    const header = m[1]!;
    const block = templateBlock(header);
    if (block) {
      const lines = header.split('\n');
      lines.splice(block.start, block.end - block.start);
      // Blank lines that only separated the template block go with it.
      while (block.start < lines.length && /^\s*$/.test(lines[block.start]!)) lines.splice(block.start, 1);
      const rest = lines.join('\n');
      const eol = /\r\n/.test(m[0]) ? '\r\n' : '\n';
      const after = out.slice(m[0].length);
      out = rest.trim() ? `---${eol}${rest.replace(/\r?\n$/, '')}${eol}---${eol}${after}` : after.replace(/^\r?\n/, '');
    }
  }
  return out
    .replace(/\{\{\s*title\s*\}\}/gi, () => values.title)
    .replace(/\{\{\s*date\s*\}\}/gi, () => today(values.date ?? new Date()));
}

/* --------------------------------------------------------------- built-in set */

interface BuiltIn {
  file: string;
  text: string;
  feature?: string;
}

const EN: BuiltIn[] = [
  {
    file: 'Character',
    text: `---
template:
  folder: Characters
tags: [character]
aliases: []
born:
died:
relations:
  father:
  mother:
  ally:
  enemy:
---
# {{title}}

Who they are, in one or two sentences.

## Appearance

## Personality

## Background

## Goals and fears

## Secrets
`,
  },
  {
    file: 'Place',
    text: `---
template:
  folder: Places
tags: [place]
founded:
relations:
  part of:
  ruled by:
---
# {{title}}

What it is and why it matters to the story.

## Geography

## People and culture

## History

## Secrets
`,
  },
  {
    file: 'Organization',
    text: `---
template:
  folder: Organizations
tags: [organization]
founded:
dissolved:
relations:
  led by:
  seat:
---
# {{title}}

What the organization wants, in one sentence.

## Structure and ranks

## Members

## Allies and rivals

## History
`,
  },
  {
    file: 'Event',
    text: `---
template:
  folder: Events
tags: [event]
year:            # or years: 429-430 for something longer
relations:
  place:
---
# {{title}}

## What happened

## Who was there

## Consequences
`,
  },
  {
    file: 'Scene',
    text: `---
template:
  folder: Scenes
tags: [scene]
status: draft
point of view:
year:
relations:
  place:
---
# {{title}}

## Goal
What the point-of-view character wants in this scene.

## Conflict

## Outcome

## Notes
Written {{date}}.
`,
  },
  {
    file: 'Playlist',
    feature: 'playlists',
    text: `---
template:
  folder: Music
playlist: true
tags: [music]
---
# {{title}}

What this music is for: a scene, a place, a mood.

Add tracks as list items, one audio file each, like \`- ![[Name of a file.mp3]]\`. Drop audio files into the editor to add them to the world. A name after \`|\` is shown in the list: \`- ![[Name of a file.mp3|Slow version]]\`.
`,
  },
  {
    file: 'Mood board',
    feature: 'moodBoards',
    text: `---
template:
  folder: Boards
moodboard: true
tags: [moodboard]
---
# {{title}}

What this board is for: a character, a place, a scene, a whole story. Open this page in Reading mode (or Side by side) and choose **Edit board** to pin pictures, colours, quotes and pages. Words written here appear under the board.
`,
  },
];

const RU: BuiltIn[] = [
  {
    file: 'Персонаж',
    text: `---
template:
  folder: Персонажи
tags: [персонаж]
aliases: []
from:            # год рождения
to:              # год смерти
relations:
  отец:
  мать:
  союзник:
  враг:
---
# {{title}}

Кто это, в одном-двух предложениях.

## Внешность

## Характер

## Прошлое

## Цели и страхи

## Тайны
`,
  },
  {
    file: 'Место',
    text: `---
template:
  folder: Места
tags: [место]
from:            # год основания
relations:
  часть:
  правитель:
---
# {{title}}

Что это за место и чем оно важно для истории.

## География

## Жители и культура

## История

## Тайны
`,
  },
  {
    file: 'Организация',
    text: `---
template:
  folder: Организации
tags: [организация]
from:            # год основания
to:              # год роспуска
relations:
  глава:
  резиденция:
---
# {{title}}

Чего хочет организация, в одном предложении.

## Устройство и звания

## Участники

## Союзники и соперники

## История
`,
  },
  {
    file: 'Событие',
    text: `---
template:
  folder: События
tags: [событие]
year:            # или years: 429-430, если дольше года
relations:
  место:
---
# {{title}}

## Что произошло

## Кто участвовал

## Последствия
`,
  },
  {
    file: 'Сцена',
    text: `---
template:
  folder: Сцены
tags: [сцена]
status: черновик
pov:             # чьими глазами
year:
relations:
  место:
---
# {{title}}

## Цель
Чего хочет герой этой сцены.

## Конфликт

## Итог

## Заметки
Написано {{date}}.
`,
  },
  {
    file: 'Плейлист',
    feature: 'playlists',
    text: `---
template:
  folder: Музыка
playlist: true
tags: [музыка]
---
# {{title}}

Для чего эта музыка: сцена, место, настроение.

Добавляйте треки пунктами списка, по одному аудиофайлу в каждом, например \`- ![[Название файла.mp3]]\`. Перетащите аудиофайлы в редактор, чтобы добавить их в мир. Текст после \`|\` покажется в списке: \`- ![[Название файла.mp3|Медленная версия]]\`.
`,
  },
  {
    file: 'Мудборд',
    feature: 'moodBoards',
    text: `---
template:
  folder: Доски
moodboard: true
tags: [мудборд]
---
# {{title}}

Для чего эта доска: персонаж, место, сцена или вся история. Откройте страницу в режиме чтения (или «Рядом») и нажмите **«Править доску»**, чтобы прикрепить картинки, цвета, цитаты и страницы. Слова, написанные здесь, появятся под доской.
`,
  },
];

/** The built-in templates in the interface language, as choices. */
export function builtInTemplates(lang: 'ru' | 'en'): TemplateChoice[] {
  return (lang === 'ru' ? RU : EN).map((b) => {
    const t: TemplateChoice = { name: b.file, text: b.text };
    const folder = templateFolder(b.text);
    if (folder) t.folder = folder;
    if (b.feature) t.feature = b.feature;
    return t;
  });
}

/** Files for a world's own templates folder: the built-in set, ready to edit. */
export function builtInTemplateFiles(lang: 'ru' | 'en'): { path: string; text: string }[] {
  const dir = lang === 'ru' ? 'Шаблоны' : 'Templates';
  return [...(lang === 'ru' ? RU : EN).map((b) => ({ path: `${dir}/${b.file}.md`, text: b.text })), ...structureTemplateFiles(lang)];
}
