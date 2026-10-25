<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../app.svelte';
  import Icon from './Icon.svelte';
  import Resizer from './Resizer.svelte';
  import { findMarks, revisionCount, revisionNotes, type CriticMark } from '../core/critic';
  import { versionsSize, type PageVersion } from '../core/versions';
  import { compareText } from '../core/names';
  import { countVersions, formatSize, formatTime } from '../i18n';

  let { path }: { path: string | null } = $props();
  const t = app.t;

  const page = $derived.by(() => {
    app.version;
    return path ? app.vault?.getPage(path) : undefined;
  });
  const commentsOn = $derived(app.on('revision'));
  const versionsOn = $derived(app.on('versions'));
  const canComment = $derived(!!path && app.editorPath === path);

  interface Item {
    mark: CriticMark;
    /** The mark as written, to find it again if the text moved. */
    raw: string;
    /** Comments: number in reading order (as in the reading view). Changes: their own number. */
    n: number;
  }

  const items = $derived.by<Item[]>(() => {
    if (!page || !commentsOn) return [];
    let c = 0;
    let k = 0;
    return findMarks(page.raw).map((mark) => ({ mark, raw: page.raw.slice(mark.from, mark.to), n: mark.kind === 'comment' ? ++c : ++k }));
  });
  const comments = $derived(items.filter((i) => i.mark.kind === 'comment'));
  const changes = $derived(items.filter((i) => i.mark.kind !== 'comment'));
  const notes = $derived(page && commentsOn ? revisionNotes(page.frontmatter) : []);
  const anyDone = $derived(notes.some((n) => n.done));

  /** Other pages of the world with open work. */
  const world = $derived.by(() => {
    app.version;
    if (!commentsOn || !app.vault) return [];
    return app.vault.index.worldPages
      .map((p) => ({ page: p, count: revisionCount(p) }))
      .filter((x) => x.count.comments + x.count.changes + x.count.notes > 0)
      .sort((a, b) => compareText(a.page.title, b.page.title));
  });

  let versions = $state<PageVersion[] | null>(null);
  $effect(() => {
    app.versionsSeq;
    const p = path;
    const vault = app.vault;
    if (!p || !vault || !versionsOn) {
      versions = null;
      return;
    }
    let live = true;
    void vault
      .versions(p)
      .then((list) => live && (versions = list))
      .catch(() => live && (versions = []));
    return () => {
      live = false;
    };
  });

  let noteText = $state('');
  let flash = $state<string | null>(null);
  let scroller = $state<HTMLElement>();

  const short = (s: string, max = 90) => {
    const one = s.replace(/\s+/g, ' ').trim();
    return one.length > max ? one.slice(0, max - 1).trimEnd() + '…' : one;
  };

  function changeLabel(m: CriticMark): string {
    if (m.kind === 'insert') return t('rev.change.insert', short(m.after, 60));
    if (m.kind === 'delete') return t('rev.change.delete', short(m.before, 60));
    return t('rev.change.replace', short(m.before, 40), short(m.after, 40));
  }

  /** Shows a comment or change in the editor, or else in the reading view. */
  function reveal(it: Item) {
    if (!path) return;
    if (app.revealInEditor(path, it.mark.from, it.mark.to)) {
      app.panelOpen = false;
      return;
    }
    const sel = it.mark.kind === 'comment' ? `.reading [data-critic="${it.n}"]` : `.reading [data-change="${it.n}"]`;
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return;
    app.panelOpen = false;
    el.scrollIntoView({ block: 'center' });
    el.classList.remove('critic-flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('critic-flash');
  }

  // A comment clicked in the reading view: point it out here.
  $effect(() => {
    const f = app.revisionFocus;
    if (!f) return;
    const key = `c${f.n}`;
    flash = key;
    void tick().then(() => scroller?.querySelector(`[data-item="${key}"]`)?.scrollIntoView({ block: 'nearest' }));
    const timer = setTimeout(() => flash === key && (flash = null), 1600);
    return () => clearTimeout(timer);
  });

  function addNote(e: SubmitEvent) {
    e.preventDefault();
    if (!path || !noteText.trim()) return;
    void app.addRevisionNote(path, noteText);
    noteText = '';
  }
</script>

<aside class="relpanel revpanel" class:open={app.panelOpen} aria-label={t('rev.title')}>
  <Resizer edge="panel-edge" value={app.panelW} onresize={(w) => app.setPanelW(w)} label={t('rev.title')} />
  <header class="panel-head">
    <div class="panel-title-row">
      <h2 class="panel-title">{t('rev.title')}{#if page}<span class="panel-page">{' · '}{page.title}</span>{/if}</h2>
      <button class="icon-btn" title={t('rev.close')} aria-label={t('rev.close')} onclick={() => ((app.revisionOpen = false), (app.panelOpen = false))}>
        <Icon name="x" />
      </button>
    </div>
  </header>

  <div class="panel-scroll" bind:this={scroller}>
    {#if !commentsOn && !versionsOn}
      <p class="rel-empty">{t('rev.off')}</p>
    {/if}

    {#if page && commentsOn}
      <section class="rev-section" aria-labelledby="rev-comments">
        <div class="rev-head">
          <h3 id="rev-comments">{t('rev.comments')}{#if comments.length}<span class="rev-count">{comments.length}</span>{/if}</h3>
          <button class="btn small" disabled={!canComment} title={canComment ? 'Ctrl+Alt+M' : t('rev.comment.needEditor')} onclick={() => app.askComment()}>{t('rev.comment.add')}</button>
        </div>
        {#if comments.length === 0}
          <p class="rev-empty">{canComment ? t('rev.comment.empty') : t('rev.comment.needEditor')}</p>
        {:else}
          <ol class="rev-list">
            {#each comments as it (it.mark.from)}
              <li class="rev-item rev-thread" class:flash={flash === `c${it.n}`} data-item="c{it.n}">
                <div class="rev-row">
                  <button class="rev-body" title={t('rev.comment.go')} onclick={() => reveal(it)}>
                    <span class="rev-num" aria-hidden="true">{it.n}</span>
                    <span class="rev-text">
                      {#if it.mark.text}<span class="rev-quote">{short(it.mark.text)}</span>{/if}
                      <span class="rev-comment" class:muted={!it.mark.comment}>{it.mark.comment || t('rev.comment.mark')}</span>
                    </span>
                  </button>
                  <span class="rev-actions">
                    <button class="icon-btn" title={t('rev.comment.edit')} aria-label={t('rev.comment.edit')} onclick={() => path && app.askEditComment(path, it.mark, it.raw)}><Icon name="pencil" /></button>
                    <button class="icon-btn" title={t('rev.comment.resolve')} aria-label={t('rev.comment.resolve')} onclick={() => path && app.resolveComment(path, it.mark, it.raw)}><Icon name="check" /></button>
                  </span>
                </div>
                {#if it.mark.replies.length}
                  <ul class="rev-replies">
                    {#each it.mark.replies as reply, ri (ri)}
                      <li>
                        <span class="rev-reply-text">{reply}</span>
                        <button class="icon-btn" title={t('rev.reply.edit')} aria-label={t('rev.reply.edit')} onclick={() => path && app.askEditReply(path, it.mark, it.raw, ri, reply)}><Icon name="pencil" /></button>
                      </li>
                    {/each}
                  </ul>
                {/if}
                <button class="rev-replybtn" onclick={() => path && app.askReply(path, it.mark, it.raw)}>{t('rev.reply')}</button>
              </li>
            {/each}
          </ol>
        {/if}
      </section>

      <section class="rev-section" aria-labelledby="rev-changes">
        <div class="rev-head">
          <h3 id="rev-changes">{t('rev.changes')}{#if changes.length}<span class="rev-count">{changes.length}</span>{/if}</h3>
        </div>
        <label class="rev-switch">
          <input type="checkbox" role="switch" checked={app.suggesting} onchange={(e) => app.setSuggesting(e.currentTarget.checked)} />
          <span>
            <span class="rev-switch-name">{t('rev.suggest')}</span>
            <span class="rev-about">{t('rev.suggest.about')}</span>
          </span>
        </label>
        {#if changes.length}
          <ol class="rev-list">
            {#each changes as it (it.mark.from)}
              <li class="rev-item rev-change" data-item="k{it.n}">
                <button class="rev-body" title={t('rev.comment.go')} onclick={() => reveal(it)}>
                  <span class="rev-text"><span class="rev-comment kind-{it.mark.kind}">{changeLabel(it.mark)}</span></span>
                </button>
                <span class="rev-actions">
                  <button class="btn small" onclick={() => path && app.settleChange(path, it.mark, it.raw, true)}>{t('rev.change.accept')}</button>
                  <button class="btn small ghost" onclick={() => path && app.settleChange(path, it.mark, it.raw, false)}>{t('rev.change.reject')}</button>
                </span>
              </li>
            {/each}
          </ol>
          {#if changes.length > 1}
            <div class="rev-foot">
              <button class="btn small" onclick={() => path && app.settleAllChanges(path, true)}>{t('rev.change.acceptAll')}</button>
              <button class="btn small ghost" onclick={() => path && app.settleAllChanges(path, false)}>{t('rev.change.rejectAll')}</button>
            </div>
          {/if}
        {/if}
      </section>

      <section class="rev-section" aria-labelledby="rev-notes">
        <div class="rev-head">
          <h3 id="rev-notes">{t('rev.notes')}{#if notes.some((n) => !n.done)}<span class="rev-count">{notes.filter((n) => !n.done).length}</span>{/if}</h3>
          {#if anyDone}<button class="btn small ghost" onclick={() => path && app.clearDoneRevisionNotes(path)}>{t('rev.notes.clear')}</button>{/if}
        </div>
        {#if notes.length === 0}<p class="rev-empty">{t('rev.notes.empty')}</p>{/if}
        {#if notes.length}
          <ul class="rev-notes">
            {#each notes as n, i (i + n.text)}
              <li class:done={n.done}>
                <label>
                  <input type="checkbox" checked={n.done} onchange={(e) => path && app.setRevisionNoteDone(path, i, e.currentTarget.checked)} />
                  <span>{n.text}</span>
                </label>
                <span class="rev-actions">
                  <button class="icon-btn" title={t('rev.notes.edit')} aria-label={t('rev.notes.edit')} onclick={() => path && app.askEditRevisionNote(path, i, n.text)}><Icon name="pencil" /></button>
                  <button class="icon-btn" title={t('rev.notes.remove')} aria-label={t('rev.notes.remove')} onclick={() => path && app.removeRevisionNote(path, i)}><Icon name="x" /></button>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
        <form class="rev-add" onsubmit={addNote}>
          <input type="text" bind:value={noteText} placeholder={t('rev.notes.placeholder')} aria-label={t('rev.notes')} />
          <button class="btn small" type="submit" disabled={!noteText.trim()}>{t('rev.notes.add')}</button>
        </form>
      </section>
    {/if}

    {#if page && versionsOn}
      <section class="rev-section" aria-labelledby="rev-versions">
        <div class="rev-head">
          <h3 id="rev-versions">{t('rev.versions')}</h3>
          <button class="btn small" onclick={() => path && app.askSaveVersion(path)}>{t('rev.versions.save')}</button>
        </div>
        {#if versions === null}
          <p class="rev-empty">{t('rev.versions.loading')}</p>
        {:else if versions.length === 0}
          <p class="rev-empty">{t('rev.versions.empty')}</p>
        {:else}
          <ul class="rev-versions">
            {#each versions as v (v.file)}
              <li>
                <button class="rev-body" onclick={() => path && app.compareVersion(path, v.file)} title={t('rev.versions.compare')}>
                  <span class="rev-text">
                    <span class="rv-time">{formatTime(app.lang, v.time)}</span>
                    <span class="rv-name" class:muted={!v.name}>{v.name ?? t('rev.versions.auto')}</span>
                  </span>
                </button>
                <span class="rev-actions">
                  <button class="btn small" onclick={() => path && app.compareVersion(path, v.file)}>{t('rev.versions.compare')}</button>
                  <button class="icon-btn" title={v.name ? t('rev.versions.rename') : t('rev.versions.name')} aria-label={v.name ? t('rev.versions.rename') : t('rev.versions.name')} onclick={() => path && app.askNameVersion(path, v)}><Icon name={v.name ? 'pencil' : 'star'} /></button>
                  <button class="icon-btn" title={t('rev.versions.delete')} aria-label={t('rev.versions.delete')} onclick={() => app.askDeleteVersion(v)}><Icon name="trash" /></button>
                </span>
              </li>
            {/each}
          </ul>
          <p class="rev-about">{t('rev.versions.about', countVersions(app.lang, versions.length), formatSize(app.lang, versionsSize(versions)))}</p>
        {/if}
      </section>
    {/if}

    {#if commentsOn && world.length > 0}
      <section class="rev-section" aria-labelledby="rev-world">
        <div class="rev-head"><h3 id="rev-world">{t('rev.world')}</h3></div>
        <p class="rev-about">{t('rev.world.about')}</p>
        <ul class="rev-world">
          {#each world as w (w.page.path)}
            <li class:current={w.page.path === path}>
              <button class="link-btn" onclick={() => app.open(w.page.path)}>{w.page.title}</button>
              <span class="rev-tally">
                {[
                  w.count.comments ? t('rev.world.comments', w.count.comments) : '',
                  w.count.changes ? t('rev.world.changes', w.count.changes) : '',
                  w.count.notes ? t('rev.world.notes', w.count.notes) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</aside>
