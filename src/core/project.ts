/**
 * Story projects: a ready set of folders for a new story. Brainstorming, outline, drafts, a story
 * bible, art, research, notes and a playlist each get a folder with one page that says what it is for.
 * An empty folder would not survive a copy or a zip, so every folder starts with a page; the pages are
 * named after the story, so several projects can live in one world.
 *
 * Everything here is ordinary files. The Drafts page is a book (`manuscript: true`) and the Playlist
 * page is a playlist (`playlist: true`), so the Book view and the player work on them as they are.
 */
import type { Lang } from '../i18n';
import { sanitizePageName } from './names';

export type SectionId = 'brainstorm' | 'outline' | 'drafts' | 'bible' | 'art' | 'research' | 'notes' | 'playlist';

interface Section {
  id: SectionId;
  folder: string;
  page: string;
  /** What the overview says about it. */
  about: string;
  /** The lines of the page, without its title. */
  body: string[];
  header?: string;
}

function sections(ru: boolean, story: string): Section[] {
  return ru
    ? [
        {
          id: 'brainstorm', folder: '1 Мозговой штурм', page: 'Идеи',
          about: 'всё, что приходит в голову, без порядка и оценок',
          body: ['Сюда — любые мысли: «а что, если…», обрывки диалогов, образы, названия.', '', '- Идея 1', '- Идея 2', '', 'Когда идея созреет, перенесите её в [[' + story + ' — План]] или [[' + story + ' — Библия]].'],
        },
        {
          id: 'outline', folder: '2 План', page: 'План',
          about: 'как история движется от начала к концу',
          body: ['Опишите ход истории в нескольких строках: начало, поворотные точки, финал.', '', '## Начало', '', '## Середина', '', '## Конец'],
        },
        {
          id: 'drafts', folder: '3 Черновики', page: 'Черновик',
          about: 'сам текст: главы и сцены (откройте «Книгу» вверху)',
          header: '---\nmanuscript: true\n---\n',
          body: ['## Глава 1'],
        },
        {
          id: 'bible', folder: '4 Библия истории', page: 'Библия',
          about: 'герои, места и правила мира, на которые вы будете ссылаться',
          body: ['То, что должно оставаться неизменным от сцены к сцене.', '', '- Герои: создавайте страницы по шаблону «Персонаж» и ссылайтесь на них здесь через `[[…]]`', '- Места: шаблон «Место»', '- Правила мира: что возможно, а что нет'],
        },
        {
          id: 'art', folder: '5 Арт', page: 'Арт',
          about: 'картинки, референсы и обложка',
          body: ['Перетащите картинки в редактор или вставьте их кнопкой в верхней панели: `![[картинка.png]]`.', '', '## Обложка', '', '## Референсы'],
        },
        {
          id: 'research', folder: '6 Исследования', page: 'Исследования',
          about: 'факты, источники и заготовки для достоверности',
          body: ['Что нужно проверить или узнать, и откуда это известно.', '', '- Вопрос — ответ — источник'],
        },
        {
          id: 'notes', folder: '7 Заметки', page: 'Заметки',
          about: 'всё остальное: планы работы, замечания, мысли по ходу',
          body: ['Рабочие заметки по проекту.', '', '- [ ] Что сделать дальше'],
        },
        {
          id: 'playlist', folder: '8 Плейлист', page: 'Плейлист',
          about: 'музыка для работы над историей',
          header: '---\nplaylist: true\n---\n',
          body: ['Музыка для работы над историей. Добавьте треки пунктами списка, например `- ![[трек.mp3]]`.'],
        },
      ]
    : [
        {
          id: 'brainstorm', folder: '1 Brainstorm', page: 'Ideas',
          about: 'everything that comes to mind, unsorted and unjudged',
          body: ['Anything goes: "what if…", scraps of dialogue, images, names.', '', '- Idea 1', '- Idea 2', '', 'When an idea is ready, move it to [[' + story + ' — Outline]] or [[' + story + ' — Story bible]].'],
        },
        {
          id: 'outline', folder: '2 Outline', page: 'Outline',
          about: 'how the story moves from start to end',
          body: ['Describe the shape of the story in a few lines: the opening, the turning points, the ending.', '', '## Beginning', '', '## Middle', '', '## End'],
        },
        {
          id: 'drafts', folder: '3 Drafts', page: 'Draft',
          about: 'the text itself: chapters and scenes (open **Book** at the top)',
          header: '---\nmanuscript: true\n---\n',
          body: ['## Chapter 1'],
        },
        {
          id: 'bible', folder: '4 Story bible', page: 'Story bible',
          about: 'the characters, places and rules of the world you will keep referring to',
          body: ['What has to stay the same from scene to scene.', '', '- Characters: make pages from the Character template and link them here with `[[…]]`', '- Places: the Place template', '- Rules of the world: what is possible and what is not'],
        },
        {
          id: 'art', folder: '5 Art', page: 'Art',
          about: 'pictures, references and the cover',
          body: ['Drop pictures into the editor or use the picture button in the top bar: `![[picture.png]]`.', '', '## Cover', '', '## References'],
        },
        {
          id: 'research', folder: '6 Research', page: 'Research',
          about: 'facts, sources and groundwork for getting things right',
          body: ['What to check or find out, and where it comes from.', '', '- Question — answer — source'],
        },
        {
          id: 'notes', folder: '7 Notes', page: 'Notes',
          about: 'everything else: work plans, feedback, thoughts as you go',
          body: ['Working notes for the project.', '', '- [ ] What to do next'],
        },
        {
          id: 'playlist', folder: '8 Playlist', page: 'Playlist',
          about: 'music to write to',
          header: '---\nplaylist: true\n---\n',
          body: ['Music to write to. Add tracks as list items, for example `- ![[track.mp3]]`.'],
        },
      ];
}

/** The folder name a story gets: the name, made safe to use as a page and folder name. */
export function projectName(raw: string): string {
  return sanitizePageName(raw.replace(/[\\/]+/g, ' '));
}

/** The name of a page in a project: the story, then what it is. */
export function projectPage(story: string, page: string): string {
  return `${story} — ${page}`;
}

/** The files of a story project called `story` (already clean): an overview and one page per section. */
export function projectFiles(story: string, lang: Lang): { path: string; text: string }[] {
  const ru = lang === 'ru';
  const list = sections(ru, story);
  const files: { path: string; text: string }[] = [];
  const intro = ru ? 'Всё об этой истории — в одном месте.' : 'Everything about this story in one place.';
  const lines = list.map((s) => `- [[${projectPage(story, s.page)}]]: ${s.about}`);
  files.push({ path: `${story}/${story}.md`, text: `# ${story}\n\n${intro}\n\n${lines.join('\n')}\n` });
  for (const s of list) {
    const title = projectPage(story, s.page);
    files.push({ path: `${story}/${s.folder}/${title}.md`, text: `${s.header ?? ''}# ${title}\n\n${s.body.join('\n')}\n` });
  }
  return files;
}
