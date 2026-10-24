/**
 * What changed between two texts, word by word.
 *
 * Written from the greedy shortest-edit-script method described by Eugene Myers ("An O(ND)
 * Difference Algorithm and Its Variations", 1986). The texts are compared line by line first, then
 * the words of each changed stretch of lines, which keeps long texts with few changes fast.
 */

export type DiffOp = 'same' | 'add' | 'del';

export interface DiffPart {
  op: DiffOp;
  text: string;
}

/** Above this many differences a stretch is shown as removed and added as a whole. */
const MAX_EDITS = 3000;

/**
 * The shortest list of keep / add / remove steps that turns `a` into `b`, or undefined when the
 * texts differ in more than `max` places.
 */
function editScript<T>(a: readonly T[], b: readonly T[], max = MAX_EDITS): DiffOp[] | undefined {
  const n = a.length;
  const m = b.length;
  const limit = Math.min(n + m, max);
  const off = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  // The furthest point on each diagonal after each round, kept to walk back along the path.
  const trace: Int32Array[] = [];
  for (let d = 0; d <= limit; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1]! < v[off + k + 1]!) ? v[off + k + 1]! : v[off + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        trace.push(v.slice(off - d, off + d + 1));
        return backtrack(trace, n, m);
      }
    }
    trace.push(v.slice(off - d, off + d + 1));
  }
  return undefined;
}

function backtrack(trace: Int32Array[], n: number, m: number): DiffOp[] {
  const ops: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d - 1]!; // holds diagonals -(d-1) .. d-1
    const at = (k: number) => prev[k + (d - 1)]!;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push('same');
      x--;
      y--;
    }
    ops.push(down ? 'add' : 'del');
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    ops.push('same');
    x--;
    y--;
  }
  return ops.reverse();
}

/** Lines with their line breaks, so joining them gives the text back. */
function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** Words, runs of spaces and single other characters. */
const TOKEN_RE = /\s+|[\p{L}\p{N}\p{M}_'’]+|[^\s\p{L}\p{N}\p{M}]/gu;

function splitWords(text: string): string[] {
  return text.match(TOKEN_RE) ?? [];
}

function push(out: DiffPart[], op: DiffOp, text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.op === op) last.text += text;
  else out.push({ op, text });
}

function apply<T extends string>(a: readonly T[], b: readonly T[], ops: readonly DiffOp[], out: DiffPart[]): void {
  let i = 0;
  let j = 0;
  for (const op of ops) {
    if (op === 'same') {
      push(out, 'same', a[i++]!);
      j++;
    } else if (op === 'del') push(out, 'del', a[i++]!);
    else push(out, 'add', b[j++]!);
  }
}

/** Compares words of one changed stretch; very different stretches are shown as replaced. */
function diffWords(oldText: string, newText: string, out: DiffPart[]): void {
  const a = splitWords(oldText);
  const b = splitWords(newText);
  const ops = editScript(a, b);
  if (!ops) {
    push(out, 'del', oldText);
    push(out, 'add', newText);
    return;
  }
  // Removed and added words next to each other read better as one removed, then one added run.
  const parts: DiffPart[] = [];
  apply(a, b, ops, parts);
  let del = '';
  let add = '';
  const flush = () => {
    push(out, 'del', del);
    push(out, 'add', add);
    del = add = '';
  };
  for (const p of parts) {
    // A lone space kept between two changes belongs to the change.
    if (p.op === 'same' && !/^\s+$/.test(p.text)) {
      flush();
      push(out, 'same', p.text);
    } else if (p.op === 'same') {
      if (del || add) {
        del += p.text;
        add += p.text;
      } else push(out, 'same', p.text);
    } else if (p.op === 'del') del += p.text;
    else add += p.text;
  }
  // Spaces carried into both sides at the end are really unchanged.
  const tail = /\s+$/.exec(del)?.[0] ?? '';
  const common = tail && add.endsWith(tail) ? tail : '';
  if (common) {
    del = del.slice(0, -common.length);
    add = add.slice(0, -common.length);
  }
  flush();
  push(out, 'same', common);
}

/** The changes from `oldText` to `newText`, as runs of unchanged, removed and added text. */
export function diffText(oldText: string, newText: string): DiffPart[] {
  const out: DiffPart[] = [];
  if (oldText === newText) {
    push(out, 'same', oldText);
    return out;
  }
  const a = splitLines(oldText.replace(/\r\n/g, '\n'));
  const b = splitLines(newText.replace(/\r\n/g, '\n'));
  const ops = editScript(a, b, 20000) ?? [...a.map((): DiffOp => 'del'), ...b.map((): DiffOp => 'add')];
  let i = 0;
  let j = 0;
  let del = '';
  let add = '';
  const flush = () => {
    if (del && add) diffWords(del, add, out);
    else {
      push(out, 'del', del);
      push(out, 'add', add);
    }
    del = add = '';
  };
  for (const op of ops) {
    if (op === 'same') {
      flush();
      push(out, 'same', a[i++]!);
      j++;
    } else if (op === 'del') del += a[i++]!;
    else add += b[j++]!;
  }
  flush();
  return out;
}

/** How many words were added and removed. */
export function diffStats(parts: readonly DiffPart[]): { added: number; removed: number } {
  const words = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  let added = 0;
  let removed = 0;
  for (const p of parts) {
    if (p.op === 'add') added += words(p.text);
    else if (p.op === 'del') removed += words(p.text);
  }
  return { added, removed };
}

/** A run of unchanged lines hidden in the middle of a long unchanged stretch. */
export interface DiffSkip {
  op: 'skip';
  text: string;
  lines: number;
}

/**
 * Shortens long unchanged stretches to a few lines around each change, so the changes are easy to
 * find. The hidden lines are kept, so the interface can show them on request.
 */
export function withContext(parts: readonly DiffPart[], context = 2): (DiffPart | DiffSkip)[] {
  const out: (DiffPart | DiffSkip)[] = [];
  parts.forEach((p, i) => {
    if (p.op !== 'same') return void out.push(p);
    const lines = splitLines(p.text);
    const first = i === 0;
    const last = i === parts.length - 1;
    const keepStart = first ? 0 : context + 1; // the rest of the changed line plus context
    const keepEnd = last ? 0 : context + 1;
    if (lines.length <= keepStart + keepEnd + 1) return void out.push(p);
    const head = lines.slice(0, keepStart).join('');
    const hidden = lines.slice(keepStart, lines.length - keepEnd);
    const tail = lines.slice(lines.length - keepEnd).join('');
    if (head) out.push({ op: 'same', text: head });
    out.push({ op: 'skip', text: hidden.join(''), lines: hidden.length });
    if (tail) out.push({ op: 'same', text: tail });
  });
  return out;
}
