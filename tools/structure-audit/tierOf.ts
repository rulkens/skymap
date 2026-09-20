/**
 * The PROPOSED tier of an area, bottom to top. The page lets you move areas between tiers
 * live; this is only the starting arrangement. Unratified: see the Q2 note in the README.
 */
export const TIERS = ['leaves', 'services', 'engine', 'state', 'layers', 'ui'] as const;

export function tierOf(area: string): (typeof TIERS)[number] {
  if (area === '@types' || area === 'data' || area === 'utils') return 'leaves';
  if (area.startsWith('services/engine')) return 'engine';
  if (area.startsWith('services/')) return 'services';
  if (area === 'state' || area === 'store') return 'state';
  if (area.startsWith('layers/')) return 'layers';
  return 'ui';
}
