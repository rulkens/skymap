/**
 * Rows are DERIVED from the galaxy-catalog registry entries so they can't
 * drift from the galaxy catalog set — and, critically, each row's `enabled`
 * comes from that entry's `visible` field, making SOURCE_REGISTRY the single
 * source of truth for default visibility (a hardcoded `enabled: true` would
 * silently override a registry entry that asks to boot hidden, e.g.
 * DesiDeep's `visible: false`). `sbScale`/`sbMax`/`falloffStrength` and the
 * bias/depth-fade knobs are eye-tuned against the running renderer; see
 * `git blame` history for their derivations if retuning.
 */

import { SOURCE_ENTRIES } from '../../../../data/sourceEntries';
import { DEFAULT_GALAXY_PROVENANCE } from '../defaults';
import type { GalaxyCatalogId } from '../../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../../../@types/settings/GalaxyCatalogItemSettings';
import type { GalaxyCatalogSettings } from '../../../../@types/settings/GalaxyCatalogSettings';

export const initialState: GalaxyCatalogSettings = {
  sizePx: 2.5,
  brightness: 1.0,
  depthFade: true,
  provenance: DEFAULT_GALAXY_PROVENANCE,
  sbScale: 5.0,
  sbMax: 30.0,
  falloffStrength: 0.7,
  items: Object.fromEntries(
    SOURCE_ENTRIES.filter((e) => e.type === 'galaxyCatalog').map((e) => [
      e.id,
      { enabled: e.visible, labelEnabled: true },
    ]),
  ) as Record<GalaxyCatalogId, GalaxyCatalogItemSettings>,
};
