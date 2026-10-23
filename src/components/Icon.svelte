<script lang="ts">
  type Name =
    | 'menu'
    | 'back'
    | 'plus'
    | 'pencil'
    | 'trash'
    | 'star'
    | 'star-fill'
    | 'x'
    | 'theme'
    | 'relations'
    | 'swap'
    | 'image'
    | 'download'
    | 'bulb'
    | 'keyboard';

  let { name }: { name: Name } = $props();
</script>

<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'menu'}
    <path d="M4 7h16M4 12h16M4 17h16" />
  {:else if name === 'back'}
    <path d="M15 5l-7 7 7 7" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'pencil'}
    <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
  {:else if name === 'trash'}
    <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />
  {:else if name === 'star'}
    <path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 19l1-5.4-4-3.8 5.4-.7z" />
  {:else if name === 'star-fill'}
    <path
      fill="currentColor"
      d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 19l1-5.4-4-3.8 5.4-.7z"
    />
  {:else if name === 'x'}
    <path d="M6 6l12 12M18 6L6 18" />
  {:else if name === 'theme'}
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4v16" />
    <path fill="currentColor" d="M12 4a8 8 0 0 1 0 16z" />
  {:else if name === 'relations'}
    <circle cx="6" cy="6" r="2" />
    <circle cx="18" cy="9" r="2" />
    <circle cx="9" cy="18" r="2" />
    <path d="M8 6.4l8 2M7 8l1.6 8M17 11l-6.5 6" />
  {:else if name === 'swap'}
    <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
  {:else if name === 'download'}
    <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />
  {:else if name === 'keyboard'}
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M17 10h.01M7 14h10" />
  {:else if name === 'bulb'}
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" />
  {:else if name === 'image'}
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M20.5 16l-5-5-8 8" />
  {/if}
</svg>
