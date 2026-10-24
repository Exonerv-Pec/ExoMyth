/**
 * Start profiles: "What are you making?" A profile switches on the parts of the app that kind of work
 * needs and switches off the rest (a worldbuilder does not need the Book view), and can add a few
 * starting pages. It changes nothing else: every part can be switched back on in Settings.
 */
import type { Lang } from '../i18n';

export type ProfileId = 'writer' | 'worldbuilder' | 'gamemaster' | 'notes' | 'everything';

export interface Profile {
  id: ProfileId;
  emoji: string;
  /** Parts switched off by this profile (everything else is on). */
  off: string[];
}

export const PROFILES: readonly Profile[] = [
  { id: 'writer', emoji: '✍️', off: ['graph', 'maps'] },
  { id: 'worldbuilder', emoji: '🗺️', off: ['manuscript', 'focusMode', 'typewriter', 'wordCount', 'writingStats'] },
  { id: 'gamemaster', emoji: '🎲', off: ['manuscript', 'focusMode', 'typewriter', 'wordCount', 'writingStats'] },
  { id: 'notes', emoji: '🗒️', off: ['timeline', 'manuscript', 'family', 'maps', 'years', 'focusMode', 'typewriter', 'playlists', 'writingStats'] },
  { id: 'everything', emoji: '✨', off: [] },
];

export function profileById(id: string): Profile | undefined {
  return PROFILES.find((p) => p.id === id);
}

/** The starting pages of a profile, for a world called `world`. */
export function starterFiles(id: ProfileId, lang: Lang, world: string): { path: string; text: string }[] {
  const ru = lang === 'ru';
  const start = ru ? 'С чего начать.md' : 'Start here.md';
  const files: { path: string; text: string }[] = [];
  const page = (title: string, lines: string[]) => `# ${title}\n\n${lines.join('\n')}\n`;

  if (id === 'writer') {
    const book = `${ru ? 'Рукопись' : 'Manuscript'}/${world}.md`;
    files.push({
      path: book,
      text: `---\nmanuscript: true\n---\n# ${world}\n\n## ${ru ? 'Глава 1' : 'Chapter 1'}\n`,
    });
    files.push({
      path: start,
      text: ru
        ? page('С чего начать', [
            `Ваша книга — [[${world}]]. Откройте **Книгу** вверху: главы — колонки, сцены — карточки.`,
            '',
            '- Новая сцена: «+ Сцена» в главе. Она создаётся по шаблону «Сцена» со статусом и точкой зрения',
            '- Персонажи и места: **+** слева и шаблоны «Персонаж», «Место»',
            '- Пишите без отвлечений: **Ctrl+.**; идеи на ходу: **Alt+I**',
            '- Ненужное выключается в **Настройках** (шестерёнка внизу слева)',
          ])
        : page('Start here', [
            `Your book is [[${world}]]. Open **Book** at the top: chapters are columns, scenes are cards.`,
            '',
            '- New scene: "+ Scene" in a chapter. It is made from the Scene template, with a status and a point of view',
            '- Characters and places: **+** on the left and the Character or Place template',
            '- Write without distractions: **Ctrl+.**; catch ideas: **Alt+I**',
            '- Switch off what you do not need in **Settings** (the gear at the bottom left)',
          ]),
    });
  } else if (id === 'worldbuilder') {
    files.push({
      path: start,
      text: ru
        ? page('С чего начать', [
            'Мир растёт из страниц и связей между ними.',
            '',
            '- **+** слева: страница по шаблону «Персонаж», «Место», «Организация» или «Событие»',
            '- Связи («союзник», «правит», «член») — на панели справа; их видно на **Графе** и в **Карточках**',
            '- Годы (`born`, `founded`, `year`) ставят страницы на **Хронику**',
            '- Карта: страница с `map: картинка.png` в шапке, метки и области — «Редактировать карту»',
            '- Семья по связям «отец», «мать», «супруг» — вкладка «Семейное древо» в Карточках',
          ])
        : page('Start here', [
            'A world grows from pages and the relations between them.',
            '',
            '- **+** on the left: a page from the Character, Place, Organization or Event template',
            '- Relations (ally, rules, member of) go in the panel on the right; see them on the **Graph** and in **Cards**',
            '- Years (`born`, `founded`, `year`) put pages on the **Timeline**',
            '- A map: a page with `map: picture.png` in its header; pins and areas in "Edit map"',
            '- Families from father, mother and spouse relations: the "Family tree" tab in Cards',
          ]),
    });
  } else if (id === 'gamemaster') {
    const tpl = ru ? 'Шаблоны/Сессия.md' : 'Templates/Session.md';
    files.push({
      path: tpl,
      text: ru
        ? `---\ntemplate:\n  folder: Сессии\ntags: [сессия]\ndate: {{date}}\n---\n# {{title}}\n\n## Игроки\n\n## Что было\n\n## Встреченные NPC\n\n## Незакрытые нити\n\n## На следующий раз\n`
        : `---\ntemplate:\n  folder: Sessions\ntags: [session]\ndate: {{date}}\n---\n# {{title}}\n\n## Players\n\n## What happened\n\n## NPCs met\n\n## Loose threads\n\n## Next time\n`,
    });
    files.push({
      path: start,
      text: ru
        ? page('С чего начать', [
            'Кампания: NPC, места, фракции и записи сессий.',
            '',
            '- После игры: **+** слева → шаблон «Сессия». Его можно поменять в папке «Шаблоны»',
            '- NPC, места и фракции: шаблоны «Персонаж», «Место», «Организация»',
            '- Быстро записать что-то прямо за столом: **Alt+I**',
            '- Музыка для сессии: страница с `playlist: true` в шапке и строками `- ![[трек.mp3]]`',
            '- Карта мира с метками: страница с `map: картинка.png`',
          ])
        : page('Start here', [
            'A campaign: NPCs, places, factions and session notes.',
            '',
            '- After a game: **+** on the left → the Session template. You can change it in the Templates folder',
            '- NPCs, places and factions: the Character, Place and Organization templates',
            '- Jot something down at the table: **Alt+I**',
            '- Music for a session: a page with `playlist: true` in its header and lines like `- ![[track.mp3]]`',
            '- A world map with pins: a page with `map: picture.png`',
          ]),
    });
  } else {
    files.push({
      path: start,
      text: ru
        ? page('С чего начать', [
            'Каждая страница — обычный файл Markdown. Ссылка на страницу: `[[Название]]`.',
            '',
            '- **+** слева — новая страница',
            '- Поиск: **Ctrl+K**; все клавиши: **Ctrl+/**',
            '- Что включено и выключено — в **Настройках** (шестерёнка внизу слева)',
          ])
        : page('Start here', [
            'Every page is a plain Markdown file. Link to a page with `[[Page name]]`.',
            '',
            '- **+** on the left: a new page',
            '- Search: **Ctrl+K**; every shortcut: **Ctrl+/**',
            '- What is on and off: **Settings** (the gear at the bottom left)',
          ]),
    });
  }
  return files;
}
