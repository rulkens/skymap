/**
 * Orbit-trails master gate, default ON. A plain literal rather than a registry `visible` gate:
 * the trails are a roster of conics composed at boot from each Layer's `guides.orbitTrails`.
 */

import type { OrbitTrailsSettings } from '../../../../@types/settings/OrbitTrailsSettings';

export const initialState: OrbitTrailsSettings = {
  enabled: true,
};
