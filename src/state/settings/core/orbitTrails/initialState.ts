/**
 * Orbit-trails overlay default — ON. The near-field Keplerian orbit trails
 * (Earth / Jupiter / Moon …) are part of the baseline solar-system scene, so
 * the master gate defaults on. A plain `true` literal like `milkyWay`'s
 * label axis: the trails are a roster of conics composed at boot
 * (`CORE_TRAIL_ELEMENTS` plus any Layer's), not a registry source with its own
 * `visible` gate.
 */

import type { OrbitTrailsSettings } from '../../../../@types/settings/OrbitTrailsSettings';

export const initialState: OrbitTrailsSettings = {
  enabled: true,
};
