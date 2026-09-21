/**
 * Rows are DERIVED from the star-catalog registry entries (mirroring
 * `galaxyCatalogs`), so they can't drift from the star-catalog set, and each
 * row's `enabled` comes from that entry's `visible` field.
 * `glowOverlap`/`refineThreshold` are tuned as a pair — see that pairing's
 * landmine on `../defaults`'s own copy.
 */

import { SOURCE_ENTRIES } from '../../../../data/sourceEntries';
import { DEFAULT_STAR_SIZE_PX } from '../defaults';
import type { StarCatalogId } from '../../../../@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../../../@types/settings/StarCatalogItemSettings';
import type { StarCatalogSettings } from '../../../../@types/settings/StarCatalogSettings';

export const initialState: StarCatalogSettings = {
  enabled: true,
  sizePx: DEFAULT_STAR_SIZE_PX,
  brightness: 1.0,
  refineThreshold: 0.16,
  glowOverlap: 3.0,
  exposureNearX: 6,
  exposureMidX: 23,
  exposureFarX: 28,
  aggregateIntensityCap: 0.06,
  items: Object.fromEntries(
    SOURCE_ENTRIES.filter((e) => e.type === 'starCatalog').map((e) => [
      e.id,
      { enabled: e.visible, labelEnabled: true },
    ]),
  ) as Record<StarCatalogId, StarCatalogItemSettings>,
};
