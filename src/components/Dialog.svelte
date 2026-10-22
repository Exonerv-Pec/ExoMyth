<script lang="ts">
  import { app } from '../app.svelte';

  const t = app.t;
  let value = $state('');
  let input = $state<HTMLInputElement>();
  let confirmBtn = $state<HTMLButtonElement>();
  let lastDialog: unknown = null;

  // Reset the text field and move focus whenever a new dialog opens.
  $effect(() => {
    const d = app.dialog;
    if (d === lastDialog) return;
    lastDialog = d;
    if (d?.kind === 'prompt') {
      value = d.value;
      queueMicrotask(() => {
        input?.focus();
        input?.select();
      });
    } else if (d?.kind === 'confirm') {
      queueMicrotask(() => confirmBtn?.focus());
    }
  });

  function close() {
    app.dialog = null;
  }

  async function submit(e: Event) {
    e.preventDefault();
    const d = app.dialog;
    if (!d) return;
    close();
    if (d.kind === 'prompt') {
      if (value.trim()) await d.onSubmit(value.trim());
    } else {
      await d.onConfirm();
    }
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

{#if app.dialog}
  {@const d = app.dialog}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={(e) => e.target === e.currentTarget && close()} onkeydown={keydown}>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <form onsubmit={submit} style="display:grid;gap:0.8rem">
      <h2 id="dlg-title">{d.title}</h2>
      {#if d.kind === 'prompt'}
        <label>
          {d.label}
          <input type="text" bind:this={input} bind:value />
        </label>
      {:else}
        <p>{d.message}</p>
      {/if}
      <div class="actions">
        <button type="button" class="btn ghost" onclick={close}>{t('dialog.cancel')}</button>
        <button
          type="submit"
          class="btn {d.kind === 'confirm' && d.danger ? 'danger' : 'primary'}"
          bind:this={confirmBtn}
          disabled={d.kind === 'prompt' && !value.trim()}
        >
          {d.confirmLabel}
        </button>
      </div>
    </form>
    </div>
  </div>
{/if}
