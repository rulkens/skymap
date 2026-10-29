import type { CraftSourceEntry } from '../../../@types/data/craft/CraftSourceEntry';
import { Source } from '../../../data/source';

/**
 * Every craft, as one row. `label`/`plural` name the CATEGORY, not the occupants, because the
 * Labels & Guides checkbox this row seeds mutes every craft caption together; naming one craft
 * would read as a per-craft toggle.
 */
export const CRAFT_ENTRY = {
  type: 'craft',
  code: Source.Craft,
  id: 'craft',
  label: 'Spacecraft',
  // Bodies near the observer, not a sky patch: the coverage mask reads `allSky` only for
  // galaxy-catalog footprints.
  allSky: true,
  bearsLabel: true,
  bearsMarker: false,
  detailLabel: 'Spacecraft',
  shortLabel: 'Spacecraft',
  plural: 'Spacecraft',
} as const satisfies CraftSourceEntry;
