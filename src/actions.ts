import { app, type HoverRect } from './app.svelte';

export function rectOf(el: Element): HoverRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/** Svelte action: show a page preview when the element is hovered or focused. */
export function previewOn(node: HTMLElement, params: { target: string; heading?: string } | null) {
  let current = params;
  const enter = () => {
    if (current) app.hoverStart(current.target, current.heading, () => (node.isConnected ? rectOf(node) : undefined));
  };
  const leave = () => app.hoverEnd();
  node.addEventListener('mouseenter', enter);
  node.addEventListener('mouseleave', leave);
  node.addEventListener('focus', enter);
  node.addEventListener('blur', leave);
  return {
    update(next: { target: string; heading?: string } | null) {
      current = next;
    },
    destroy() {
      node.removeEventListener('mouseenter', enter);
      node.removeEventListener('mouseleave', leave);
      node.removeEventListener('focus', enter);
      node.removeEventListener('blur', leave);
    },
  };
}

/**
 * Svelte action for rendered Markdown: previews every `a.wikilink` inside the element,
 * including links added later, through event delegation.
 */
export function previewLinks(node: HTMLElement) {
  let active: HTMLAnchorElement | null = null;
  const linkFrom = (e: Event) => (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a.wikilink') ?? null;
  const over = (e: Event) => {
    const link = linkFrom(e);
    if (link === active) return;
    active = link;
    if (!link) return app.hoverEnd();
    app.hoverStart(link.dataset.target ?? '', link.dataset.heading, () => (link.isConnected ? rectOf(link) : undefined));
  };
  const out = (e: Event) => {
    const to = (e as MouseEvent | FocusEvent).relatedTarget as Node | null;
    if (active && to && active.contains(to)) return;
    if (!linkFrom(e)) return;
    active = null;
    app.hoverEnd();
  };
  node.addEventListener('mouseover', over);
  node.addEventListener('mouseout', out);
  node.addEventListener('focusin', over);
  node.addEventListener('focusout', out);
  return {
    destroy() {
      node.removeEventListener('mouseover', over);
      node.removeEventListener('mouseout', out);
      node.removeEventListener('focusin', over);
      node.removeEventListener('focusout', out);
    },
  };
}
