/**
 * Which pages of a world use a part of the app, so the settings can say what switching it off
 * would hide. Switching a part off never changes pages; it only stops showing what they hold.
 */
import type { VaultIndex } from './index';
import type { Page } from './types';
import { compareText } from './names';
import { pageYears } from './years';
import { mapOf } from './maps';
import { hasFamily, kinship } from './family';
import { isPlaylist } from './playlist';

/** Parts of the app whose use shows in pages. */
export type UsedFeature = 'timeline' | 'years' | 'family' | 'maps' | 'playlists';

export function featureUsage(index: VaultIndex): Record<UsedFeature, Page[]> {
  const kin = kinship(index);
  const dated: Page[] = [];
  const family: Page[] = [];
  const maps: Page[] = [];
  const playlists: Page[] = [];
  for (const page of index.worldPages) {
    const map = mapOf(page);
    if (pageYears(page)) dated.push(page);
    if (hasFamily(kin, page.path)) family.push(page);
    if (map) maps.push(page);
    if (isPlaylist(page)) playlists.push(page);
  }
  // "Years" also covers maps whose pins or areas have years of their own.
  const withYears = [...dated];
  for (const page of maps) {
    const map = mapOf(page)!;
    if (!dated.includes(page) && [...map.pins, ...map.regions].some((x) => x.from !== undefined || x.to !== undefined)) withYears.push(page);
  }
  const byTitle = (list: Page[]) => list.sort((a, b) => compareText(a.title, b.title) || compareText(a.path, b.path));
  return { timeline: byTitle(dated), years: byTitle(withYears), family: byTitle(family), maps: byTitle(maps), playlists: byTitle(playlists) };
}
