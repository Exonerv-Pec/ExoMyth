<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../app.svelte';
  import { familyTree, hasFamily, kinship } from '../core/family';
  import { pageImage, initialsOf } from '../core/cards';
  import { formatYears, pageYears } from '../core/years';
  import { stripMd } from '../core/names';
  import { previewOn } from '../actions';
  import type { Key } from '../i18n';
  import MediaThumb from './MediaThumb.svelte';

  let { colorOf }: { colorOf: (group: string) => string } = $props();
  const t = app.t;

  const index = $derived.by(() => {
    app.version;
    return app.vault?.index;
  });
  const kin = $derived(index ? kinship(index) : undefined);
  const tree = $derived(index && kin && app.current ? familyTree(index, app.current, kin) : undefined);
  /** People who do have a family, offered when the selected page has none. */
  const withFamily = $derived(index && kin ? index.worldPages.filter((p) => hasFamily(kin, p.path)).slice(0, 12) : []);

  const GEN: Record<number, Key> = {
    [-3]: 'family.gen.-3',
    [-2]: 'family.gen.-2',
    [-1]: 'family.gen.-1',
    0: 'family.gen.0',
    1: 'family.gen.1',
    2: 'family.gen.2',
  };

  const group = (path: string) => (path.includes('/') ? path.slice(0, path.indexOf('/')) : '');

  /* ------------------------------------------------------------- lines */

  let inner = $state<HTMLDivElement>();
  const cards = new Map<string, HTMLElement>();
  let paths = $state<{ d: string; couple: boolean; key: string }[]>([]);

  function card(node: HTMLElement, path: string) {
    cards.set(path, node);
    return {
      destroy() {
        if (cards.get(path) === node) cards.delete(path);
      },
    };
  }

  /** Draws the lines between the cards where they actually are on screen. */
  function measure() {
    if (!inner || !tree) {
      paths = [];
      return;
    }
    const base = inner.getBoundingClientRect();
    const box = (p: string) => {
      const r = cards.get(p)?.getBoundingClientRect();
      return r && { l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top, cx: (r.left + r.right) / 2 - base.left, cy: (r.top + r.bottom) / 2 - base.top };
    };
    const out: typeof paths = [];
    for (const [a, b] of tree.couples) {
      const x = box(a);
      const y = box(b);
      if (x && y) out.push({ key: `c:${a}:${b}`, couple: true, d: `M ${x.r} ${x.cy - 2} H ${y.l} M ${x.r} ${x.cy + 2} H ${y.l}` });
    }
    for (const link of tree.links) {
      const child = box(link.child);
      const ps = link.parents.map(box).filter((x): x is NonNullable<typeof x> => !!x);
      if (!child || !ps.length) continue;
      const ax = ps.reduce((n, p) => n + p.cx, 0) / ps.length;
      const ay = Math.max(...ps.map((p) => p.b));
      const mid = ay + (child.t - ay) / 2;
      out.push({ key: `l:${link.child}`, couple: false, d: `M ${ax} ${ay} V ${mid} H ${child.cx} V ${child.t}` });
    }
    paths = out;
  }

  $effect(() => {
    void tree;
    void tick().then(measure);
  });
  $effect(() => {
    if (!inner || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(inner);
    return () => ro.disconnect();
  });

  /* ------------------------------------------------------------- picking */

  let lastClick = { path: '', time: 0 };
  function choose(path: string) {
    const now = performance.now();
    if (lastClick.path === path && now - lastClick.time < 400) {
      lastClick = { path: '', time: 0 };
      void app.openText(path);
      return;
    }
    lastClick = { path, time: now };
    // Choosing someone moves the tree to them, so a family can be walked through.
    void app.open(path);
  }
</script>

{#if tree && index}
  <div class="family">
    <p class="cards-note family-help">{t('family.help')}</p>
    <div class="family-inner" bind:this={inner}>
      <svg class="family-lines" aria-hidden="true">
        {#each paths as p (p.key)}<path d={p.d} class:couple={p.couple} />{/each}
      </svg>
      {#each tree.rows as row (row.gen)}
        <div class="family-row">
          <span class="family-gen">{GEN[row.gen] ? t(GEN[row.gen]!) : ''}</span>
          <div class="family-units">
            {#each row.units as unit (unit.join('|'))}
              <div class="family-unit">
                {#each unit as path (path)}
                  {@const page = index.get(path)}
                  {#if page}
                    {@const years = pageYears(page)}
                    <button
                      class="family-card"
                      class:focus={path === tree.focus}
                      class:faded={!!app.outOfTime?.has(path)}
                      style:--c={colorOf(group(path))}
                      use:card={path}
                      use:previewOn={{ target: stripMd(path) }}
                      onclick={() => choose(path)}
                      onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), void app.openText(path))}
                    >
                      <span class="fc-media" aria-hidden="true">
                        <MediaThumb target={pageImage(page)} alt="">
                          {#snippet fallback()}<span class="fc-initials">{initialsOf(page.title)}</span>{/snippet}
                        </MediaThumb>
                      </span>
                      <span class="fc-name">{page.title}</span>
                      {#if years}<span class="fc-years">{formatYears(years)}</span>{/if}
                    </button>
                  {/if}
                {/each}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <div class="family-empty">
    <p class="cards-note">{app.current ? t('family.none', index?.get(app.current)?.title ?? '') : t('cards.select')}</p>
    <p class="cards-note">{t('family.how')}</p>
    {#if withFamily.length}
      <p class="cards-note">{t('family.try')}</p>
      <div class="tag-row">
        {#each withFamily as p (p.path)}<button class="chip" onclick={() => app.open(p.path)}>{p.title}</button>{/each}
      </div>
    {/if}
  </div>
{/if}
