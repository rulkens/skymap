import type { CelestrakGroup } from '../@types/satellites/CelestrakGroup';

// Order is precedence: an object in two groups keeps the first one's class (a fresh launch sits in
// both `active` and `last-30-days`). CelesTrak has no full-catalog group and none for rocket bodies;
// the full catalog is Space-Track's (spec §5.1).
export const CELESTRAK_GROUPS: readonly CelestrakGroup[] = [
  { group: 'active', class: 'active' },
  { group: 'fengyun-1c-debris', class: 'debris' },
  { group: 'iridium-33-debris', class: 'debris' },
  { group: 'cosmos-2251-debris', class: 'debris' },
  { group: 'analyst', class: 'other' },
  { group: 'last-30-days', class: 'by-name' },
];
