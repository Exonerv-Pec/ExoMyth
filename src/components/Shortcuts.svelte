<script lang="ts">
  import { app } from '../app.svelte';
  import type { Key } from '../i18n';

  const t = app.t;

  /** Apple keyboards show ⌘ and ⌥ where others say Ctrl and Alt. */
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  const keyName = (k: string) => (mac ? ({ Ctrl: '⌘', Alt: '⌥', Shift: '⇧' } as Record<string, string>)[k] ?? k : k);

  /** One way to press a shortcut: keys pressed together, e.g. ['Ctrl', 'K']. */
  type Combo = string[];
  interface Row {
    keys: Combo[];
    what: Key;
  }
  interface Group {
    title: Key;
    rows: Row[];
  }

  const groups: Group[] = [
    {
      title: 'keys.group.everywhere',
      rows: [
        { keys: [['Ctrl', 'K']], what: 'keys.search' },
        { keys: [['Alt', 'I']], what: 'keys.idea' },
        { keys: [['Ctrl', '.']], what: 'keys.focus' },
        { keys: [['Ctrl', '/'], ['?']], what: 'keys.help' },
        { keys: [['Ctrl', ',']], what: 'keys.settings' },
        { keys: [['Esc']], what: 'keys.close' },
      ],
    },
    {
      title: 'keys.group.search',
      rows: [
        { keys: [['Enter']], what: 'keys.search.open' },
        { keys: [['Esc']], what: 'keys.search.clear' },
      ],
    },
    {
      title: 'keys.group.text',
      rows: [
        { keys: [['Ctrl', 'click']], what: 'keys.text.follow' },
        { keys: [['Ctrl', 'Z']], what: 'keys.text.undo' },
        { keys: [['Ctrl', 'Shift', 'Z'], ['Ctrl', 'Y']], what: 'keys.text.redo' },
        { keys: [['Tab'], ['Shift', 'Tab']], what: 'keys.text.indent' },
        { keys: [['Ctrl', 'Enter']], what: 'keys.text.saveNote' },
        { keys: [['Enter'], ['Space']], what: 'keys.text.spoiler' },
      ],
    },
    {
      title: 'keys.group.graph',
      rows: [
        { keys: [['←↑→↓']], what: 'keys.graph.move' },
        { keys: [['+'], ['−'], ['wheel']], what: 'keys.graph.zoom' },
        { keys: [['0']], what: 'keys.graph.fit' },
        { keys: [['Space']], what: 'keys.graph.select' },
        { keys: [['Enter']], what: 'keys.graph.open' },
      ],
    },
    {
      title: 'keys.group.timeline',
      rows: [
        { keys: [['←'], ['→']], what: 'keys.timeline.year' },
        { keys: [['Shift', '←'], ['Shift', '→']], what: 'keys.timeline.decade' },
        { keys: [['Ctrl', 'wheel']], what: 'keys.timeline.zoom' },
        { keys: [['Enter']], what: 'keys.timeline.open' },
      ],
    },
    {
      title: 'keys.group.book',
      rows: [
        { keys: [['Alt', '←↑→↓']], what: 'keys.book.move' },
        { keys: [['Enter']], what: 'keys.graph.open' },
      ],
    },
    {
      title: 'keys.group.map',
      rows: [
        { keys: [['wheel']], what: 'keys.map.zoom' },
        { keys: [['Esc']], what: 'keys.map.full' },
        { keys: [['←↑→↓']], what: 'keys.map.move' },
        { keys: [['Delete']], what: 'keys.map.delete' },
      ],
    },
  ];

  const label = (k: string) => (k === 'click' ? t('keys.click') : k === 'wheel' ? t('keys.wheel') : keyName(k));
  const close = () => (app.shortcutsOpen = false);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && app.shortcutsOpen && close()} />

{#if app.shortcutsOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="dialog shortcuts" role="dialog" aria-modal="true" aria-labelledby="keys-title">
      <div class="shortcuts-head">
        <h2 id="keys-title">{t('keys.title')}</h2>
        <button class="btn ghost" onclick={close}>{t('keys.done')}</button>
      </div>
      <div class="shortcuts-body">
        {#each [groups.slice(0, 3), groups.slice(3)] as column, c (c)}
        <div class="shortcuts-col">
        {#each column as g (g.title)}
          <section>
            <h3>{t(g.title)}</h3>
            <dl>
              {#each g.rows as row (row.what)}
                <div>
                  <dt>
                    {#each row.keys as combo, i (i)}
                      {#if i > 0}<span class="or">{t('keys.or')}</span>{/if}
                      <span class="combo">
                        {#each combo as k, j (j)}{#if j > 0}<span class="plus">+</span>{/if}<kbd>{label(k)}</kbd>{/each}
                      </span>
                    {/each}
                  </dt>
                  <dd>{t(row.what)}</dd>
                </div>
              {/each}
            </dl>
          </section>
        {/each}
        </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
