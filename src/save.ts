import { isDesktop, saveFile } from './desktop';

/**
 * Saves a file made in the app (a world's .zip, a book, a picture): the browser downloads it, and
 * the desktop app asks where to put it. False when the person cancels that question.
 */
export async function saveToDevice(data: Uint8Array | Blob, name: string, type = 'application/octet-stream'): Promise<boolean> {
  if (isDesktop) {
    const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
    return saveFile(bytes, name);
  }
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
