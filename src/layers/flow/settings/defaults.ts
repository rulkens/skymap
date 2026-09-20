/**
 * flow — the Layer's user-settable defaults, seeding `flowSlice`. Every field
 * is registry-derived: `sources/flow.ts` is the authority, so retune the
 * hand-dialled advect look THERE, not here.
 */

import { SOURCE_REGISTRY, Source } from '../../../data/sources';
import type { FlowSettings } from '../../../@types/settings/FlowSettings';

/**
 * Default state of the CF4++ peculiar-velocity flow-field overlay — the
 * shared seed for `settings.flow` (engine) and the SettingsPanel store
 * fallback (App.tsx).
 *
 * Derived from the SOURCE_REGISTRY flow row: `enabled` from its `visible`
 * gate, the eight look/motion knobs from the `FlowFieldDefaults` it carries.
 * The registry row is the single source of truth — to retune the hand-dialled
 * advect look, edit `sources/flow.ts`, not here.
 */
export const DEFAULT_FLOW: FlowSettings = {
  enabled: SOURCE_REGISTRY[Source.Flow].visible,
  mode: SOURCE_REGISTRY[Source.Flow].mode,
  intensity: SOURCE_REGISTRY[Source.Flow].intensity,
  count: SOURCE_REGISTRY[Source.Flow].count,
  trail: SOURCE_REGISTRY[Source.Flow].trail,
  flowSpeed: SOURCE_REGISTRY[Source.Flow].flowSpeed,
  densityBias: SOURCE_REGISTRY[Source.Flow].densityBias,
  wander: SOURCE_REGISTRY[Source.Flow].wander,
  boundaryFadeWidth: SOURCE_REGISTRY[Source.Flow].boundaryFadeWidth,
};
