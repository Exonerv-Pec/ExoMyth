/**
 * Story structure templates: well-known shapes for planning a story or checking a draft, written
 * in our own words. Each is a page with one heading per part, a question under it to answer, and a
 * short checklist at the end. They are built-in page templates (see templates.ts), offered in their
 * own group, "Story structure", in the New page window; a world can keep its own copies in its
 * templates folder (`template:` / `group: structure`).
 *
 * The shapes are common property of storytelling: the three acts, Freytag's five-part arc, the
 * hero's journey, a seven-point shape and the East Asian kishōtenketsu.
 */
import type { Lang } from '../i18n';
import type { TemplateChoice } from './templates';

export const STRUCTURE_GROUP = 'structure';
export const STRUCTURE_FEATURE = 'storyStructures';

interface Shape {
  name: string;
  intro: string;
  /** The parts: a heading and the question under it. */
  parts: [title: string, ask: string][];
  /** Things to check in a draft, after the parts. */
  checks: string[];
}

interface Words {
  folder: string;
  checkTitle: string;
  shapes: Shape[];
}

const EN: Words = {
  folder: 'Outlines',
  checkTitle: 'Check the draft',
  shapes: [
    {
      name: 'Three acts',
      intro:
        'A story in three movements: a beginning that sets things up, a long middle where things get harder, and an end that pays it off. Under each part write what happens in your story, and list the scenes that carry it as links, like `- [[Scene name]]`.',
      parts: [
        ['Act one: setup', 'Who is the story about, where are they, and what does an ordinary day look like for them?'],
        ['The disturbance', 'What happens that the hero cannot ignore? Something is now different.'],
        ['The first turn', 'What choice or event pushes the hero out of the old life for good? After this there is no going back.'],
        ['Act two: rising trouble', 'What does the hero try, and how do things get harder? Who helps, and who stands in the way?'],
        ['The midpoint', 'What discovery or reversal in the middle changes what the hero thinks the story is about?'],
        ['The lowest point', 'When does it look as if the hero has lost? What does it cost them?'],
        ['The second turn', 'What new idea, ally or resolve opens a way forward? The last stretch begins.'],
        ['Act three: the showdown', 'How does the hero face the main problem? What do they use that they did not have at the start?'],
        ['The aftermath', 'What has changed, for the hero and for the world? What does an ordinary day look like now?'],
      ],
      checks: [
        'Does the hero want something clear, and does every part push toward it or away from it?',
        'Does each turn come from a choice the hero makes, not from luck?',
        'Does the ending answer the question the beginning asked?',
        'Could any part be cut without changing the story? If so, rework it.',
      ],
    },
    {
      name: 'Five acts',
      intro:
        'The five-part arc often drawn as a pyramid: the story climbs to a peak and then comes down. It suits stories that build slowly towards one big moment. Under each part write what happens, and link the scenes that carry it.',
      parts: [
        ['Exposition', 'Who and where? What does the reader need to know to care?'],
        ['Rising action', 'Which chain of events raises the stakes, one step after another?'],
        ['Climax', 'What is the peak: the moment everything turns, the hardest choice?'],
        ['Falling action', 'What follows from that choice? What is still unresolved?'],
        ['Resolution', 'What is the new balance? What is left, and what has been lost?'],
      ],
      checks: [
        'Does every step of the rising action make things harder than the one before?',
        'Is the climax the result of what came before, not a surprise from outside?',
        'Does the falling action tie up the threads you opened, or leave them on purpose?',
        'Is the ending as long as it needs to be, and no longer?',
      ],
    },
    {
      name: "Hero's journey",
      intro:
        'A twelve-step shape for a hero who leaves home, meets trouble in an unfamiliar world and comes back changed. It fits adventures and quests best, but each step is only a question: skip or reorder the ones your story does not need.',
      parts: [
        ['Everyday world', 'Who is the hero before the story starts? What is missing or off in their life?'],
        ['The call', 'What invites or forces them to leave?'],
        ['Hesitation', 'Why do they not go at once? What do they fear?'],
        ['A guide appears', 'Who or what gives advice, a tool or the courage to go?'],
        ['Crossing over', 'What is the moment they step into the unfamiliar world for good?'],
        ['Trials and companions', 'Which tests do they face? Who becomes a friend, who a foe, and what are the new rules?'],
        ['Closing in', 'What preparation and doubt come before the greatest danger?'],
        ['The ordeal', 'The hero faces their greatest fear or loss. What dies, in the story or in them?'],
        ['The prize', 'What do they win, learn or take? What does it cost?'],
        ['The way back', 'What makes them turn for home, and what chases them?'],
        ['The last test', 'Which final challenge shows whether they truly changed?'],
        ['Coming home changed', 'What do they bring back, and for whom? How is the everyday world different now?'],
      ],
      checks: [
        'Does the hero change, and can a reader point to the moment it shows?',
        'Is the return different from the start, or only a repeat?',
        'Does the guide help without solving the hero’s problem for them?',
        'Do the trials get harder, and does each teach the hero something they need later?',
      ],
    },
    {
      name: 'Seven points',
      intro:
        'A shape that starts from the ending: the first and last points mirror each other, and the ones between push the story from one to the other. Plan it backwards if you like: write the resolution first, then the hook that is its opposite.',
      parts: [
        ['Hook', 'Where does the hero begin? Show a starting state that is the opposite of where they will end.'],
        ['First turn', 'What event pulls them into the story and gives them a goal?'],
        ['First pressure', 'How does the opposing force hit hard for the first time? What does the hero lose or fear?'],
        ['Midpoint', 'The hero stops reacting and starts acting. What changes their approach?'],
        ['Second pressure', 'The opposing force is at its strongest and the hero’s plan falls apart. What is lost now?'],
        ['Second turn', 'The last piece falls into place: the knowledge, tool or courage that was missing.'],
        ['Resolution', 'The ending, mirroring the hook. How has the hero changed?'],
      ],
      checks: [
        'Do the hook and the resolution mirror each other?',
        'Does the midpoint change the hero from reacting to acting?',
        'Does the second turn use something planted earlier, so it feels earned?',
        'Does every point follow from the one before it?',
      ],
    },
    {
      name: 'Kishōtenketsu',
      intro:
        'A four-part shape from East Asian storytelling that does not need a conflict. It sets out a world, deepens it, turns it with a surprise, then lets the parts meet. Good for quiet stories, short fiction and stories where understanding matters more than winning.',
      parts: [
        ['Ki: introduction', 'Introduce the people and the place. Keep it calm and clear.'],
        ['Shō: development', 'Follow them further. Add detail, not trouble, and let the reader settle in.'],
        ['Ten: twist', 'Something unexpected: a new view, or a turn that seems unrelated at first.'],
        ['Ketsu: reconciliation', 'Bring the twist and the earlier parts together. What new meaning appears?'],
      ],
      checks: [
        'Is the twist surprising and still fair, with something earlier that points to it?',
        'Do the first two parts give the reader enough to feel the twist?',
        'Does the last part connect everything, instead of explaining it away?',
        'Does the story work without a villain or a fight?',
      ],
    },
  ],
};

const RU: Words = {
  folder: 'Структуры',
  checkTitle: 'Проверка черновика',
  shapes: [
    {
      name: 'Три акта',
      intro:
        'История в трёх частях: начало, которое всё расставляет, длинная середина, где становится труднее, и конец, который всё оправдывает. Под каждой частью запишите, что происходит в вашей истории, и перечислите сцены, которые её несут, ссылками: `- [[Название сцены]]`.',
      parts: [
        ['Акт первый: завязка', 'О ком эта история, где они и как выглядит их обычный день?'],
        ['Нарушение порядка', 'Что случается такого, что герой не может проигнорировать? Теперь что-то не так, как раньше.'],
        ['Первый поворот', 'Какой выбор или событие навсегда выталкивает героя из прежней жизни? Дороги назад больше нет.'],
        ['Акт второй: нарастающие трудности', 'Что пробует герой и как становится труднее? Кто помогает, а кто мешает?'],
        ['Середина', 'Какое открытие или переворот посередине меняет представление героя о том, о чём эта история?'],
        ['Самая низкая точка', 'Когда кажется, что герой проиграл? Чего это ему стоит?'],
        ['Второй поворот', 'Какая новая мысль, союзник или решимость открывает путь вперёд? Начинается последний отрезок.'],
        ['Акт третий: развязка', 'Как герой встречает главную проблему? Что он использует из того, чего не было в начале?'],
        ['После', 'Что изменилось, для героя и для мира? Как выглядит обычный день теперь?'],
      ],
      checks: [
        'Хочет ли герой чего-то ясного, и каждая ли часть ведёт к этому или уводит от этого?',
        'Каждый ли поворот вытекает из выбора героя, а не из везения?',
        'Отвечает ли конец на вопрос, заданный в начале?',
        'Можно ли выбросить какую-то часть, не изменив историю? Тогда её стоит переделать.',
      ],
    },
    {
      name: 'Пять актов',
      intro:
        'Пятичастная дуга, которую часто рисуют пирамидой: история поднимается к вершине и спускается. Подходит историям, которые медленно идут к одному главному моменту. Под каждой частью запишите, что происходит, и свяжите её со сценами.',
      parts: [
        ['Экспозиция', 'Кто и где? Что нужно знать читателю, чтобы ему было не всё равно?'],
        ['Развитие действия', 'Какая цепочка событий поднимает ставки шаг за шагом?'],
        ['Кульминация', 'Что вершина: момент, когда всё переворачивается, самый трудный выбор?'],
        ['Спад', 'Что следует из этого выбора? Что осталось неразрешённым?'],
        ['Развязка', 'Каково новое равновесие? Что осталось и что потеряно?'],
      ],
      checks: [
        'Каждый ли шаг развития делает положение труднее предыдущего?',
        'Вытекает ли кульминация из случившегося раньше, а не приходит как неожиданность со стороны?',
        'Закрывает ли спад нити, которые вы открыли, или оставляет их открытыми намеренно?',
        'Не длиннее ли конец, чем нужно?',
      ],
    },
    {
      name: 'Путь героя',
      intro:
        'Двенадцать шагов для героя, который уходит из дома, попадает в беду в незнакомом мире и возвращается другим. Лучше всего подходит приключениям и квестам, но каждый шаг — лишь вопрос: пропускайте и переставляйте те, что вашей истории не нужны.',
      parts: [
        ['Обычный мир', 'Кто герой до начала истории? Чего не хватает или что не так в его жизни?'],
        ['Зов', 'Что приглашает или заставляет его уйти?'],
        ['Колебание', 'Почему он не уходит сразу? Чего боится?'],
        ['Появляется проводник', 'Кто или что даёт совет, вещь или смелость идти?'],
        ['Переход', 'В какой момент он навсегда входит в незнакомый мир?'],
        ['Испытания и спутники', 'Какие проверки его ждут? Кто становится другом, кто врагом, какие здесь правила?'],
        ['Приближение', 'Какие приготовления и сомнения предшествуют самой большой опасности?'],
        ['Главное испытание', 'Герой встречает самый большой страх или потерю. Что умирает, в истории или в нём самом?'],
        ['Награда', 'Что он получает, узнаёт или берёт? Чего это стоит?'],
        ['Дорога назад', 'Что заставляет его повернуть домой и что за ним гонится?'],
        ['Последняя проверка', 'Какое последнее испытание показывает, что он действительно изменился?'],
        ['Возвращение другим', 'Что он приносит и для кого? Чем теперь отличается обычный мир?'],
      ],
      checks: [
        'Меняется ли герой, и можно ли показать момент, где это видно?',
        'Отличается ли возвращение от начала, а не просто повторяет его?',
        'Помогает ли проводник, не решая проблему за героя?',
        'Становятся ли испытания труднее, и учит ли каждое тому, что понадобится позже?',
      ],
    },
    {
      name: 'Семь точек',
      intro:
        'Форма, которая начинается с конца: первая и последняя точки зеркальны, а те, что между ними, ведут историю от одной к другой. Можно планировать с конца: сначала запишите развязку, потом зацепку, которая ей противоположна.',
      parts: [
        ['Зацепка', 'С чего герой начинает? Покажите исходное состояние, противоположное тому, чем он закончит.'],
        ['Первый поворот', 'Какое событие втягивает его в историю и даёт ему цель?'],
        ['Первое давление', 'Как противостоящая сила впервые бьёт сильно? Что герой теряет или чего боится?'],
        ['Середина', 'Герой перестаёт реагировать и начинает действовать. Что меняет его подход?'],
        ['Второе давление', 'Противостоящая сила на пике, план героя рушится. Что теряется теперь?'],
        ['Второй поворот', 'Встаёт на место последний кусок: знание, средство или смелость, которых не хватало.'],
        ['Развязка', 'Конец, зеркальный зацепке. Как изменился герой?'],
      ],
      checks: [
        'Зеркальны ли зацепка и развязка?',
        'Превращает ли середина героя из реагирующего в действующего?',
        'Использует ли второй поворот то, что было заложено раньше, чтобы он казался заслуженным?',
        'Следует ли каждая точка из предыдущей?',
      ],
    },
    {
      name: 'Кисётэнкэцу',
      intro:
        'Четыре части из восточноазиатского повествования, которым не нужен конфликт. Сначала мир показан, потом углублён, затем повёрнут неожиданностью, и наконец части встречаются. Хорошо для тихих историй, короткой прозы и историй, где важнее понять, чем победить.',
      parts: [
        ['Ки: введение', 'Представьте людей и место. Спокойно и ясно.'],
        ['Сё: развитие', 'Проследите за ними дальше. Добавляйте подробности, а не беды, и дайте читателю освоиться.'],
        ['Тэн: поворот', 'Что-то неожиданное: новый взгляд или поворот, который сначала кажется не связанным со всем остальным.'],
        ['Кэцу: соединение', 'Сведите поворот и прежние части вместе. Какой новый смысл появляется?'],
      ],
      checks: [
        'Неожиданен ли поворот и при этом честен: есть ли раньше что-то, что на него намекает?',
        'Дают ли первые две части достаточно, чтобы читатель почувствовал поворот?',
        'Связывает ли последняя часть всё воедино, а не объясняет это?',
        'Работает ли история без злодея и драки?',
      ],
    },
  ],
};

function text(words: Words, shape: Shape): string {
  const head = `---\ntemplate:\n  folder: ${words.folder}\n  group: ${STRUCTURE_GROUP}\ntags: [${words === RU ? 'план' : 'outline'}]\n---\n`;
  const parts = shape.parts.map(([title, ask]) => `## ${title}\n> ${ask}\n`).join('\n');
  const checks = shape.checks.map((c) => `- [ ] ${c}`).join('\n');
  return `${head}# {{title}}\n\n${shape.intro}\n\n${parts}\n## ${words.checkTitle}\n${checks}\n`;
}

/** The built-in structure templates, as choices for the New page window. */
export function structureTemplates(lang: Lang): TemplateChoice[] {
  const words = lang === 'ru' ? RU : EN;
  return words.shapes.map((s) => ({
    name: s.name,
    text: text(words, s),
    folder: words.folder,
    group: STRUCTURE_GROUP,
    feature: STRUCTURE_FEATURE,
  }));
}

/** The same templates as files for a world's own templates folder. */
export function structureTemplateFiles(lang: Lang): { path: string; text: string }[] {
  const dir = lang === 'ru' ? 'Шаблоны' : 'Templates';
  return structureTemplates(lang).map((t) => ({ path: `${dir}/${t.name}.md`, text: t.text }));
}
