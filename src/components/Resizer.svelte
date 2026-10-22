<script lang="ts">
  let {
    edge,
    value,
    onresize,
    label,
  }: {
    /** `sidebar-edge` sits on the right edge of the left column, `panel-edge` on the left edge of the right column. */
    edge: 'sidebar-edge' | 'panel-edge';
    value: number;
    onresize: (width: number) => void;
    label: string;
  } = $props();

  const direction = $derived(edge === 'sidebar-edge' ? 1 : -1);

  function down(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const start = value;
    const move = (ev: PointerEvent) => onresize(start + direction * (ev.clientX - startX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    document.body.classList.add('resizing');
  }

  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 40 : 12;
    if (e.key === 'ArrowLeft') onresize(value - direction * step);
    else if (e.key === 'ArrowRight') onresize(value + direction * step);
    else return;
    e.preventDefault();
  }
</script>

<!-- A focusable separator is the WAI-ARIA pattern for a resizable split; Svelte's lint rule predates it. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="resizer {edge}"
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuenow={value}
  tabindex="0"
  onpointerdown={down}
  onkeydown={key}
></div>
