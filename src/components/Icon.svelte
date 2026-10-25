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
    | 'keyboard'
    | 'move'
    | 'focus'
    | 'spell'
    | 'tree'
    | 'gear'
    | 'search'
    | 'skip-back'
    | 'skip-forward'
    | 'repeat'
    | 'chart'
    | 'check'
    | 'review'
    | 'help';

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
  {:else if name === 'move'}
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M10 13h6M13.5 10.5L16 13l-2.5 2.5" />
  {:else if name === 'focus'}
    <path d="M4 9V5h4M16 5h4v4M20 15v4h-4M8 19H4v-4" />
  {:else if name === 'spell'}
    <path d="M3 15l3-9 3 9M4 12h4M12 6v9h3a2.2 2.2 0 0 0 0-4.5H12M15 10.5a2 2 0 0 0 0-4.5h-3" />
    <path d="M14 19l2.5 2L21 16" />
  {:else if name === 'gear'}
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8l1.6 2.1 2.6-.6.8 2.5 2.5.8-.6 2.6 2.1 1.6-2.1 1.6.6 2.6-2.5.8-.8 2.5-2.6-.6L12 21.2l-1.6-2.1-2.6.6-.8-2.5-2.5-.8.6-2.6L3 12l2.1-1.6-.6-2.6 2.5-.8.8-2.5 2.6.6z" />
  {:else if name === 'tree'}
    <rect x="9" y="3" width="6" height="4" rx="1" />
    <rect x="3" y="16" width="6" height="4" rx="1" />
    <rect x="15" y="16" width="6" height="4" rx="1" />
    <path d="M12 7v4.5M6 16v-4.5h12V16" />
  {:else if name === 'keyboard'}
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M17 10h.01M7 14h10" />
  {:else if name === 'bulb'}
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" />
  {:else if name === 'image'}
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M20.5 16l-5-5-8 8" />
  {:else if name === 'search'}
    <circle cx="10.5" cy="10.5" r="5.5" />
    <path d="M15 15l5 5" />
  {:else if name === 'skip-back'}
    <path d="M6 5v14M18 6l-9 6 9 6z" />
  {:else if name === 'skip-forward'}
    <path d="M18 5v14M6 6l9 6-9 6z" />
  {:else if name === 'repeat'}
    <path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4" />
  {:else if name === 'chart'}
    <path d="M5 20V11M12 20V5M19 20v-6" />
  {:else if name === 'check'}
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  {:else if name === 'help'}
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7M12 16.8h.01" />
  {:else if name === 'review'}
    <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-7.5L7 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z" />
    <path d="M8.5 10.5l2.2 2.2 4.6-4.6" />
  {/if}
</svg>
