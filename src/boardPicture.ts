/**
 * Draws a mood board into one PNG picture, on this device. Pictures come from the world's own files
 * (the same object URLs the board shows), so nothing is fetched and the canvas stays readable.
 * The layout is the one on screen: positions from the board, heights as measured in the page.
 */
import { app } from './app.svelte';
import { mediaUrl } from './embeds';
import { inkOn, pictureLayout, wrapLines, type BoardItem, type Box } from './core/board';
import { pageImage } from './core/cards';

/** Colours and fonts of the board as the page shows it, read from its styles. */
interface Look {
  surface: string;
  paper: string;
  ink: string;
  soft: string;
  faint: string;
  accent: string;
  line: string;
  broken: string;
  fontText: string;
  fontUi: string;
}

function lookOf(el: Element): Look {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    surface: v('--surface', '#f7f9f9'),
    paper: v('--paper', '#edf1f2'),
    ink: v('--ink', '#17262f'),
    soft: v('--ink-soft', '#3c4e59'),
    faint: v('--ink-faint', '#566873'),
    accent: v('--accent', '#1f7a6d'),
    line: v('--line-strong', '#9fb1ba'),
    broken: v('--broken', '#b0432f'),
    fontText: v('--font-text', 'Georgia, serif'),
    fontUi: v('--font-ui', 'system-ui, sans-serif'),
  };
}

function loadImage(url: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = url;
  });
}

async function pictureOf(target: string | undefined): Promise<HTMLImageElement | undefined> {
  if (!target) return undefined;
  const url = await mediaUrl(target);
  return url ? loadImage(url) : undefined;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, Math.max(0, h), Math.min(r, w / 2, h / 2));
}

/** Draws `img` into the box, filling it and cutting off what does not fit (like `object-fit: cover`). */
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  // Drawn whole at the final size first: a picture without its own size in pixels (an SVG with only
  // a viewBox) is then scaled as a whole, and the cut below works the same for every kind of file.
  const tw = Math.max(1, Math.round(iw * scale));
  const th = Math.max(1, Math.round(ih * scale));
  const whole = document.createElement('canvas');
  whole.width = tw;
  whole.height = th;
  whole.getContext('2d')?.drawImage(img, 0, 0, tw, th);
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(whole, (tw - w) / 2, (th - h) / 2, w, h, x, y, w, h);
  ctx.restore();
}

/** Writes wrapped text from the top-left corner and returns where the next line would start. */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, max: number, lineHeight: number): number {
  for (const line of wrapLines(s, max, (t) => ctx.measureText(t).width)) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

export interface PictureInput {
  items: readonly BoardItem[];
  /** Measured heights of the items, in board widths. */
  heights: ReadonlyMap<number, number>;
  /** Width of the board on screen, in pixels: text keeps its size relative to the board. */
  screenWidth: number;
  /** An element inside the board, to read its colours and fonts from. */
  styleFrom: Element;
  /** Width of the picture without its margin, in pixels. */
  width?: number;
}

/** The board as a PNG picture. */
export async function boardPicture({ items, heights, screenWidth, styleFrom, width = 1600 }: PictureInput): Promise<Blob> {
  const look = lookOf(styleFrom);
  const { height, boxes } = pictureLayout(items, heights, width);
  // One CSS pixel on screen is `k` pixels in the picture.
  const k = width / Math.max(1, screenWidth);
  const rem = 16 * k;
  const pad = Math.round(0.03 * width);
  const canvas = document.createElement('canvas');
  canvas.width = width + pad * 2;
  canvas.height = height + pad * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw pictures');
  ctx.fillStyle = look.surface;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(pad, pad);
  ctx.textBaseline = 'top';
  const radius = 4 * k;

  // Load every picture first, so the drawing below is one pass in board order.
  const images = new Map<number, HTMLImageElement | undefined>();
  await Promise.all(
    items.map(async (item) => {
      if (item.kind === 'image') images.set(item.index, await pictureOf(item.image));
      else if (item.kind === 'page') {
        const page = item.page ? app.vault?.index.resolve(item.page) : undefined;
        images.set(item.index, page ? await pictureOf(pageImage(page)) : undefined);
      }
    }),
  );

  const caption = (s: string | undefined, b: Box, top: number) => {
    if (!s) return;
    ctx.font = `${0.8 * rem}px ${look.fontUi}`;
    ctx.fillStyle = look.soft;
    text(ctx, s, b.x, top + 0.25 * rem, b.w, 1.15 * 0.8 * rem);
  };
  const shadow = (on: boolean) => {
    ctx.shadowColor = on ? 'rgba(0, 0, 0, 0.18)' : 'transparent';
    ctx.shadowBlur = on ? 4 * k : 0;
    ctx.shadowOffsetY = on ? 1 * k : 0;
  };

  for (const b of boxes) {
    const item = b.item;
    if (item.kind === 'image') {
      const img = images.get(item.index);
      if (!img) {
        ctx.setLineDash([4 * k, 3 * k]);
        ctx.strokeStyle = look.broken;
        ctx.lineWidth = k;
        roundRect(ctx, b.x, b.y, b.w, Math.min(b.h, 3 * rem), radius);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `${0.82 * rem}px ${look.fontUi}`;
        ctx.fillStyle = look.broken;
        text(ctx, item.image ?? '', b.x + 0.8 * rem, b.y + 0.8 * rem, b.w - 1.6 * rem, rem);
        continue;
      }
      const h = item.h !== undefined ? item.h * width : (b.w * img.naturalHeight) / Math.max(1, img.naturalWidth);
      shadow(true);
      ctx.fillStyle = look.surface;
      roundRect(ctx, b.x, b.y, b.w, h, radius);
      ctx.fill();
      shadow(false);
      cover(ctx, img, b.x, b.y, b.w, h, radius);
      caption(item.caption, b, b.y + h);
    } else if (item.kind === 'color') {
      const h = (item.h ?? item.w) * width;
      ctx.fillStyle = item.color ?? '#000000';
      roundRect(ctx, b.x, b.y, b.w, h, radius);
      ctx.fill();
      ctx.strokeStyle = look.line;
      ctx.lineWidth = k;
      ctx.stroke();
      caption(item.caption, b, b.y + h);
    } else if (item.kind === 'quote') {
      shadow(true);
      ctx.fillStyle = look.paper;
      roundRect(ctx, b.x, b.y, b.w, b.h, radius);
      ctx.fill();
      shadow(false);
      ctx.fillStyle = look.accent;
      ctx.fillRect(b.x, b.y, 3 * k, b.h);
      ctx.font = `italic ${rem}px ${look.fontText}`;
      ctx.fillStyle = look.ink;
      let y = text(ctx, item.quote ?? '', b.x + 0.8 * rem, b.y + 0.6 * rem, b.w - 1.6 * rem, 1.5 * rem);
      if (item.source) {
        ctx.font = `${0.82 * rem}px ${look.fontText}`;
        ctx.fillStyle = look.faint;
        y += 0.3 * rem;
        text(ctx, `— ${item.source}`, b.x + 0.8 * rem, y, b.w - 1.6 * rem, 1.2 * rem);
      }
    } else if (item.kind === 'note') {
      const tint = item.tint ?? '#f3e3a1';
      shadow(true);
      ctx.fillStyle = tint;
      roundRect(ctx, b.x, b.y, b.w, b.h, radius);
      ctx.fill();
      shadow(false);
      ctx.font = `${0.92 * rem}px ${look.fontUi}`;
      ctx.fillStyle = inkOn(tint);
      text(ctx, item.note ?? '', b.x + 0.7 * rem, b.y + 0.6 * rem, b.w - 1.4 * rem, 1.4 * rem);
    } else {
      const page = item.page ? app.vault?.index.resolve(item.page) : undefined;
      shadow(true);
      ctx.fillStyle = look.paper;
      roundRect(ctx, b.x, b.y, b.w, b.h, radius);
      ctx.fill();
      shadow(false);
      ctx.strokeStyle = page ? look.line : look.broken;
      ctx.lineWidth = k;
      if (!page) ctx.setLineDash([4 * k, 3 * k]);
      ctx.stroke();
      ctx.setLineDash([]);
      let y = b.y + 0.5 * rem;
      const img = images.get(item.index);
      if (img) {
        const ih = Math.min(7 * rem, ((b.w - 1.2 * rem) * img.naturalHeight) / Math.max(1, img.naturalWidth));
        cover(ctx, img, b.x + 0.6 * rem, y, b.w - 1.2 * rem, ih, radius);
        y += ih + 0.3 * rem;
      }
      ctx.font = `600 ${rem}px ${look.fontUi}`;
      ctx.fillStyle = page ? look.ink : look.broken;
      text(ctx, page?.title ?? item.page ?? '', b.x + 0.6 * rem, y, b.w - 1.2 * rem, 1.3 * rem);
    }
  }

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be made'))), 'image/png'));
}

/** Hands a file made on this device to the browser to save. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
