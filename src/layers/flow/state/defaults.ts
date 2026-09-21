/**
 * flow — the Layer's user-settable defaults, seeding `flowSlice`. These values
 * ARE the spike's hand-dialled advect look; the SOURCE_REGISTRY flow row
 * carries the asset, not the look, so retune them here.
 */

import { MAX_PARTICLES } from '../../../data/flow/flowFieldConstants';
import type { FlowSettings } from '../../../@types/settings/FlowSettings';

/**
 * Default state of the CF4++ peculiar-velocity flow-field overlay — the
 * shared seed for `settings.flow` (engine) and the SettingsPanel store
 * fallback (App.tsx).
 *
 * `enabled` is off because the velocity cube is tens of MB and demand-loads on
 * the first enable, so a fresh session pays nothing until the user asks for it.
 * A plain literal, not registry-derived: `FLOW_ENTRY.visible` exists for
 * registry consistency but is not itself this default's source.
 *
 * The eight look/motion knobs are the spike's hand-dialled advect look. Do not
 * "tidy" them; they ARE the look. `count` starts at the buffer ceiling so the
 * field reads dense the moment it's enabled; the slider trims downward.
 */
export const DEFAULT_FLOW: FlowSettings = {
  enabled: false,
  mode: 'advect',
  intensity: 0.18,
  count: MAX_PARTICLES,
  trail: 0.002,
  flowSpeed: 0.02,
  densityBias: 0.98,
  wander: 0.15,
  boundaryFadeWidth: 0.1,
};
