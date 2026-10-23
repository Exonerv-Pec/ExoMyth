// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { MemoryStorage } from '../src/core/storage';
import { readWorldZip, safeZipPath, uniqueName, worldNameFromZip, worldToZip, zipFolderName, ZipTooLargeError } from '../src/core/archive';
import { DEMO_FILES } from '../src/demo';

describe('worlds as .zip files', () => {
  it('packs every file of a world into a folder named after it', async () => {
    const storage = new MemoryStorage('Silver: Coast?', {
      'Welcome.md': '# Hi',
      'Places/Rivertown.md': '# Rivertown',
      '.exomyth/settings.json': '{}',
      '.trash/Old.md': 'gone',
    });
    await storage.writeBytes('attachments/map.png', new Uint8Array([137, 80, 78, 71]));
    const { data, files } = await worldToZip(storage);
    expect(files).toBe(4);
    const inside = unzipSync(data);
    expect(Object.keys(inside).sort()).toEqual([
      'Silver Coast/.exomyth/settings.json',
      'Silver Coast/Places/Rivertown.md',
      'Silver Coast/Welcome.md',
      'Silver Coast/attachments/map.png',
    ]);
    expect(strFromU8(inside['Silver Coast/Places/Rivertown.md']!)).toBe('# Rivertown');
    expect([...inside['Silver Coast/attachments/map.png']!]).toEqual([137, 80, 78, 71]);
  });

  it('round-trips the demo world exactly', async () => {
    const { data } = await worldToZip(new MemoryStorage('Demo world', DEMO_FILES));
    const { files, skipped } = readWorldZip(data);
    expect(skipped).toBe(0);
    expect(Object.fromEntries([...files].map(([p, d]) => [p, strFromU8(d)]))).toEqual(DEMO_FILES);
  });

  it('keeps paths inside the world and skips system leftovers', () => {
    expect(safeZipPath('Places/Rivertown.md')).toBe('Places/Rivertown.md');
    expect(safeZipPath('./Places\\Rivertown.md')).toBe('Places/Rivertown.md');
    for (const bad of ['../evil.md', 'a/../../b.md', '/etc/passwd', 'C:/x.md', 'a//b.md', 'dir/', '__MACOSX/._a.md', 'a/.DS_Store', '.git/config', 'x/.trash/y.md']) {
      expect(safeZipPath(bad)).toBeUndefined();
    }
  });

  it('opens zipped folders and loose files, skipping unsafe entries', () => {
    const wrapped = zipSync({ 'My World/a.md': strToU8('A'), 'My World/sub/b.md': strToU8('B'), '__MACOSX/My World/._a.md': strToU8('x') });
    const r1 = readWorldZip(wrapped);
    expect([...r1.files.keys()].sort()).toEqual(['a.md', 'sub/b.md']);
    expect(r1.skipped).toBe(1);

    const loose = zipSync({ 'a.md': strToU8('A'), 'Places/b.md': strToU8('B'), '../../escape.md': strToU8('!') });
    const r2 = readWorldZip(loose);
    expect([...r2.files.keys()].sort()).toEqual(['Places/b.md', 'a.md']);
    expect(r2.skipped).toBe(1);
  });

  it('refuses archives that are too large', () => {
    const many = zipSync(Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`p${i}.md`, strToU8('x'.repeat(100))])));
    expect(() => readWorldZip(many, { files: 4, bytes: 1e9 })).toThrow(ZipTooLargeError);
    expect(() => readWorldZip(many, { files: 100, bytes: 300 })).toThrow(ZipTooLargeError);
    expect(readWorldZip(many, { files: 5, bytes: 500 }).files.size).toBe(5);
  });

  it('does not trust the sizes an archive claims', () => {
    // Stored (not compressed) files whose central directory says they are 1 byte long.
    const zip = zipSync({ 'a.md': [strToU8('x'.repeat(400)), { level: 0 }], 'b.md': [strToU8('y'.repeat(400)), { level: 0 }] });
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    for (let i = 0; i + 4 <= zip.length; i++) if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 1, true);
    expect(() => readWorldZip(zip, { files: 10, bytes: 500 })).toThrow(ZipTooLargeError);
  });

  it('names worlds from file names without clashing', () => {
    expect(worldNameFromZip('Silver Coast.zip')).toBe('Silver Coast');
    expect(worldNameFromZip('a/b:c.ZIP')).toBe('a b c');
    expect(zipFolderName('...')).toBe('World');
    expect(uniqueName('Demo world', ['demo world', 'Demo world (2)'])).toBe('Demo world (3)');
    expect(uniqueName('New', ['Old'])).toBe('New');
  });
});
