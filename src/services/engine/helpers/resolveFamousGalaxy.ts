/**
 * resolveFamousGalaxy — look up a famous galaxy by its sidecar id (e.g. 'm87')
 * and build the display-ready `GalaxyInfo` for it, or null when the famous
 * catalog / sidecar hasn't loaded yet or the id is unknown.
 *
 * The `findIndex`-by-id + `buildGalaxyInfo` pair is the canonical way to turn a
 * famous id into a resolved target; it was hand-rolled at the palette-select
 * entry point and is now wanted by the recording drivers too. Both share this
 * one resolver rather than each re-deriving the lookup — the null guards (cloud
 * not yet loaded, unknown id) live in exactly one place.
 */

import type { GalaxyStore } from '../../../@types/engine/data/GalaxyStore';
import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import { Source } from '../../../data/sources';
import { buildGalaxyInfo } from './galaxyInfoBuilder';

export function resolveFamousGalaxy(galaxies: GalaxyStore, id: string): GalaxyInfo | null {
  const cloud = galaxies.get(Source.FamousGalaxy);
  if (!cloud) return null;
  const localIdx = galaxies.famousMeta.findIndex((m) => m.id === id);
  if (localIdx < 0) return null;
  return buildGalaxyInfo(cloud, localIdx, Source.FamousGalaxy, galaxies.famousMeta);
}
