import { TIERS } from './structureAuditDefaults';

/** The PROPOSED tier of an area; the page lets you move areas live, this is only the start. */
export function tierOf(area: string): (typeof TIERS)[number] {
  if (area === '@types' || area === 'data' || area === 'utils') return 'leaves';
  if (area.startsWith('services/engine')) return 'engine';
  if (area.startsWith('services/')) return 'services';
  if (area === 'state' || area === 'store') return 'state';
  if (area.startsWith('layers/')) return 'layers';
  return 'ui';
}
