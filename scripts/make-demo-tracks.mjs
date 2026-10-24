// Writes the three short tracks of the demo world into examples/demo-world/attachments/.
// The melodies and the synthesis are our own: a few plucked or soft notes, mixed from sine waves,
// as 8-bit mono WAV at 8 kHz, so each file stays small. The output is deterministic.
// Run: node scripts/make-demo-tracks.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const RATE = 8000;
const OUT = new URL('../examples/demo-world/attachments/', import.meta.url);
mkdirSync(OUT, { recursive: true });

/** Frequency of a note: semitones above A4 (440 Hz). */
const hz = (semitones) => 440 * 2 ** (semitones / 12);
// Note names to semitones from A4, for readability below.
const N = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
const note = (name, octave = 4) => {
  const letter = name[0];
  const shift = name.includes('#') ? 1 : name.includes('b') ? -1 : 0;
  return N[letter] + shift + (octave - 4) * 12;
};

/** Adds a note to the mix: a sine with a few harmonics and an envelope. */
function voice(mix, start, seconds, semis, { gain = 0.3, attack = 0.005, decay = 3, harmonics = [1, 0.4, 0.15], hold = 0 } = {}) {
  const f = hz(semis);
  const from = Math.floor(start * RATE);
  const n = Math.floor(seconds * RATE);
  for (let i = 0; i < n && from + i < mix.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / attack) * Math.exp(-Math.max(0, t - hold) * decay) * Math.min(1, (seconds - t) / 0.08);
    let s = 0;
    harmonics.forEach((h, k) => (s += h * Math.sin(2 * Math.PI * f * (k + 1) * t)));
    mix[from + i] += s * env * gain;
  }
}

/** A soft echo, so the notes ring a little in a room. */
function room(mix, delay = 0.19, feedback = 0.35, wet = 0.5) {
  const d = Math.floor(delay * RATE);
  const out = Float32Array.from(mix);
  for (let i = d; i < out.length; i++) out[i] += out[i - d] * feedback;
  for (let i = 0; i < mix.length; i++) mix[i] = mix[i] * (1 - wet) + out[i] * wet;
}

function wav(mix) {
  let peak = 0;
  for (const v of mix) peak = Math.max(peak, Math.abs(v));
  const data = new Uint8Array(mix.length);
  let seed = 12345;
  const fade = Math.floor(RATE * 0.25);
  for (let i = 0; i < mix.length; i++) {
    // A tiny deterministic dither keeps the 8-bit steps from sounding harsh.
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const dither = (seed / 2 ** 32 - 0.5) * 0.9;
    const edge = Math.min(1, i / fade, (mix.length - i) / fade);
    const v = (mix[i] / (peak || 1)) * 0.85 * edge;
    data[i] = Math.max(0, Math.min(255, Math.round(128 + v * 127 + dither)));
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, Buffer.from(data)]);
}

function track(file, seconds, build) {
  const mix = new Float32Array(Math.floor(seconds * RATE));
  build(mix);
  writeFileSync(new URL(file, OUT), wav(mix));
}

// 1. Fiddle in the rain: a lively little jig in D dorian, plucked, with a drone underneath.
track('Fiddle in the rain.wav', 8, (mix) => {
  const beat = 0.2;
  const tune = [
    ['D', 5], ['F', 5], ['A', 5], ['F', 5], ['D', 5], ['F', 5],
    ['E', 5], ['G', 5], ['B', 5], ['G', 5], ['E', 5], ['G', 5],
    ['F', 5], ['A', 5], ['C', 6], ['A', 5], ['F', 5], ['A', 5],
    ['E', 5], ['D', 5], ['C', 5], ['D', 5], ['E', 5], ['D', 5],
  ];
  let t = 0;
  for (let round = 0; round < 2; round++)
    tune.forEach(([n, o], i) => {
      voice(mix, t, 0.5, note(n, o), { gain: 0.3, decay: 7, harmonics: [1, 0.5, 0.25, 0.1] });
      if (i % 6 === 0) voice(mix, t, 1.2, note('D', 3), { gain: 0.16, decay: 1.2, harmonics: [1, 0.3] });
      t += beat;
    });
  room(mix, 0.17, 0.4, 0.45);
});

// 2. Last call: a slow waltz in A minor, one soft chord arpeggiated over each bar.
track('Last call.wav', 9, (mix) => {
  const bar = 1.5;
  const chords = [
    [['A', 3], ['E', 4], ['A', 4], ['C', 5]],
    [['F', 3], ['C', 4], ['F', 4], ['A', 4]],
    [['D', 3], ['A', 3], ['D', 4], ['F', 4]],
    [['E', 3], ['B', 3], ['E', 4], ['G#', 4]],
    [['A', 3], ['E', 4], ['A', 4], ['C', 5]],
    [['F', 3], ['C', 4], ['F', 4], ['A', 4]],
  ];
  chords.forEach((chord, b) => {
    chord.forEach(([n, o], k) => voice(mix, b * bar + k * (bar / 3.2), 1.6, note(n, o), { gain: 0.26, decay: 2.6, harmonics: [1, 0.35, 0.1] }));
  });
  room(mix, 0.27, 0.45, 0.5);
});

// 3. Dawn over the river: slow pads that rise and fall, with a few high bell notes.
track('Dawn over the river.wav', 10, (mix) => {
  const pads = [
    [0, ['D', 3], ['A', 3], ['F', 4]],
    [2.5, ['C', 3], ['G', 3], ['E', 4]],
    [5, ['Bb', 2], ['F', 3], ['D', 4]],
    [7.5, ['A', 2], ['E', 3], ['C#', 4]],
  ];
  for (const [at, ...tones] of pads)
    for (const [n, o] of tones) voice(mix, at, 3.4, note(n, o), { gain: 0.2, attack: 0.9, decay: 0.6, hold: 1.6, harmonics: [1, 0.2] });
  [['A', 5, 1.2], ['F', 5, 3.1], ['E', 5, 4.6], ['D', 5, 6.4], ['A', 5, 8.2]].forEach(([n, o, at]) =>
    voice(mix, at, 1.8, note(n, o), { gain: 0.16, decay: 2.4, harmonics: [1, 0, 0.35, 0, 0.1] }),
  );
  room(mix, 0.31, 0.5, 0.55);
});
console.log('Tracks written to', OUT.pathname);
