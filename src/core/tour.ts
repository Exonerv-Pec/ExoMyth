/**
 * The first-run tour: a few hints over the interface the first time a world is opened in a browser.
 * Each step points at one part of the screen (marked in the interface with `data-tour="…"`); when
 * none of its parts is on screen (a phone with the side panels closed), the hint stands in the middle.
 */

export interface TourStep {
  /** Names the text of the step: `tour.<id>.title` and `tour.<id>.text`. */
  id: 'welcome' | 'pages' | 'modes' | 'panel' | 'keys' | 'guide';
  /** Parts of the screen to point at, the first one shown wins; none for a step in the middle. */
  targets: string[];
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'welcome', targets: [] },
  { id: 'pages', targets: ['sidebar', 'menu'] },
  { id: 'modes', targets: ['modes'] },
  { id: 'panel', targets: ['panel', 'panel-button'] },
  { id: 'keys', targets: ['lookup'] },
  { id: 'guide', targets: ['guide'] },
];

/** Where the tour is remembered as seen, in this browser. */
export const TOUR_KEY = 'exomyth:tour';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Whether a part of the screen can be pointed at: it has a size and lies (mostly) in the window. */
export function onScreen(r: Rect, vw: number, vh: number): boolean {
  if (r.width < 4 || r.height < 4) return false;
  const visibleW = Math.min(r.left + r.width, vw) - Math.max(r.left, 0);
  const visibleH = Math.min(r.top + r.height, vh) - Math.max(r.top, 0);
  return visibleW > r.width / 2 && visibleH > Math.min(r.height, vh) / 3;
}

/**
 * Where the hint goes: beside the part it points at, on the side with the most room (below, above,
 * right, left), and always inside the window with a margin. Without a part, in the middle.
 */
export function placeHint(target: Rect | null, hint: { width: number; height: number }, vw: number, vh: number, gap = 12, margin = 12): { left: number; top: number; side: 'below' | 'above' | 'right' | 'left' | 'middle' } {
  const clampX = (x: number) => Math.max(margin, Math.min(x, vw - hint.width - margin));
  const clampY = (y: number) => Math.max(margin, Math.min(y, vh - hint.height - margin));
  if (!target) return { left: clampX((vw - hint.width) / 2), top: clampY((vh - hint.height) / 2), side: 'middle' };
  const room = {
    below: vh - (target.top + target.height),
    above: target.top,
    right: vw - (target.left + target.width),
    left: target.left,
  };
  const fitsV = (space: number) => space >= hint.height + gap + margin;
  const fitsH = (space: number) => space >= hint.width + gap + margin;
  const centerX = target.left + target.width / 2 - hint.width / 2;
  const centerY = target.top + target.height / 2 - hint.height / 2;
  if (fitsV(room.below)) return { left: clampX(centerX), top: target.top + target.height + gap, side: 'below' };
  if (fitsV(room.above)) return { left: clampX(centerX), top: target.top - hint.height - gap, side: 'above' };
  if (fitsH(room.right)) return { left: target.left + target.width + gap, top: clampY(centerY), side: 'right' };
  if (fitsH(room.left)) return { left: target.left - hint.width - gap, top: clampY(centerY), side: 'left' };
  // A part as big as the window (a phone): over it, in the middle.
  return { left: clampX((vw - hint.width) / 2), top: clampY((vh - hint.height) / 2), side: 'middle' };
}
