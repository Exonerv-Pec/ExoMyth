/**
 * Exomyth for the desktop (see src-tauri): the same app in a window of its own. Here the window talks
 * to its Rust side, which keeps worlds in folders on this computer, saves files where the person
 * chooses, opens web links in their own browser and, only when asked, checks for a new version.
 *
 * In the browser none of this runs: `isDesktop` is false and nothing here is called.
 */
import { invoke } from '@tauri-apps/api/core';
import type { FileEntry } from './core/types';
import { isVersionPath, type VaultStorage } from './core/storage';

/** True inside the desktop app. */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** A folder the person picked, remembered by the desktop app. */
export interface DesktopFolder {
  id: string;
  name: string;
  path: string;
  lastOpened: number;
}

export interface UpdateInfo {
  current: string;
  latest: string | null;
  newer: boolean;
}

export const listFolders = (): Promise<DesktopFolder[]> => invoke('folders_list');

/** Shows the system's folder dialog; undefined when the person closes it. */
export const pickFolder = async (title: string): Promise<DesktopFolder | undefined> => (await invoke<DesktopFolder | null>('folder_pick', { title })) ?? undefined;

/** Asks where to keep a new world and makes a folder called `name` there. */
export const createFolder = async (title: string, name: string): Promise<DesktopFolder | undefined> =>
  (await invoke<DesktopFolder | null>('folder_create', { title, name })) ?? undefined;

/** Opens a remembered folder; fails when it is no longer there. */
export const openFolder = (id: string): Promise<DesktopFolder> => invoke('folder_open', { id });

export const forgetFolder = (id: string): Promise<void> => invoke('folder_forget', { id });

/** Asks GitHub for the newest version. Only ever called from the "Check for updates" button. */
export const checkUpdate = (): Promise<UpdateInfo> => invoke('update_check');

export const openReleases = (): Promise<void> => invoke('open_releases');

/** Lets the person choose where to save a file made in the app. False when they cancel. */
export function saveFile(data: Uint8Array, name: string): Promise<boolean> {
  return invoke('save_file', data, { headers: { 'x-name': encodeURIComponent(name) } });
}

/** A file's bytes as Tauri hands them over (an ArrayBuffer; a list of numbers in older versions). */
function bytes(data: ArrayBuffer | ArrayBufferView | number[]): Uint8Array {
  if (Array.isArray(data)) return Uint8Array.from(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data);
}

/** A world in a folder on this computer, read and written by the desktop app's Rust side. */
export class DesktopStorage implements VaultStorage {
  readonly kind = 'folder' as const;
  readonly label: string;

  constructor(readonly folder: DesktopFolder) {
    this.label = folder.name;
  }

  private call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
    return invoke<T>(cmd, { folder: this.folder.id, ...args });
  }

  async list(): Promise<FileEntry[]> {
    return (await this.call<FileEntry[]>('fs_list', { dir: '' })).filter((e) => !isVersionPath(e.path));
  }
  listDir(dir: string): Promise<FileEntry[]> {
    const d = dir.replace(/\/+$/, '');
    return d ? this.call('fs_list', { dir: d }) : this.call('fs_list', { dir: '' });
  }
  async stat(path: string): Promise<FileEntry | undefined> {
    return (await this.call<FileEntry | null>('fs_stat', { path })) ?? undefined;
  }
  async readBytes(path: string): Promise<Uint8Array> {
    return bytes(await this.call<ArrayBuffer>('fs_read', { path }));
  }
  async readText(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readBytes(path));
  }
  writeBytes(path: string, data: Uint8Array): Promise<void> {
    return invoke('fs_write', data, {
      headers: { 'x-folder': encodeURIComponent(this.folder.id), 'x-path': encodeURIComponent(path) },
    });
  }
  writeText(path: string, content: string): Promise<void> {
    return this.writeBytes(path, new TextEncoder().encode(content));
  }
  remove(path: string): Promise<void> {
    return this.call('fs_remove', { path });
  }
  exists(path: string): Promise<boolean> {
    return this.call('fs_exists', { path });
  }
}

/**
 * Marks the page as the desktop app. Web links need nothing here: the Rust side opens them in the
 * person's own browser and never lets the window leave Exomyth.
 */
export function startDesktop(): void {
  document.documentElement.classList.add('desktop');
}
