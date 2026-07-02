/**
 * PARAM_SPEC — verbatim port of the spike's `SPEC` table
 * (`Galaxy Renderer.dc.html:450-461`): the `[min, max, step]` range for
 * every slider-driven `GalaxyParams` field, reshaped from a tuple into
 * `ParamSpecEntry`'s named fields.
 *
 * This is the ONLY place slider ranges exist. The spike's individual
 * `<input type="range">` elements also carried their own min/max attributes
 * (`Galaxy Renderer.dc.html:745`), but those were always overwritten by the
 * SPEC lookup at render time — dead fallback values that never took effect.
 * They are not ported; a slider with no SPEC entry (e.g. `seed`, the
 * `*Seed` fields, `warpStart`) simply isn't range-constrained.
 */

import type { GalaxyParams } from '../../@types/model/GalaxyParams';
import type { ParamSpecEntry } from '../../@types/data/ParamSpecEntry';

export const PARAM_SPEC: Readonly<Partial<Record<keyof GalaxyParams & string, ParamSpecEntry>>> = {
  radius: { min: 0.4, max: 1.8, step: 0.05 },
  starCount: { min: 100000, max: 1000000, step: 50000 },
  bulgeSize: { min: 0.2, max: 2, step: 0.05 },
  bulgeFalloff: { min: 0, max: 1, step: 0.02 },
  diskThickness: { min: 0.35, max: 1.8, step: 0.05 },
  irregularity: { min: 0, max: 1, step: 0.02 },
  armCount: { min: 1, max: 8, step: 1 },
  armWinding: { min: 0, max: 1, step: 0.02 },
  armWidth: { min: 0.4, max: 2, step: 0.05 },
  armStrength: { min: 0, max: 1.5, step: 0.05 },
  subArms: { min: 0, max: 1, step: 0.02 },
  armFalloff: { min: 0, max: 1, step: 0.02 },
  armEdgeVar: { min: 0, max: 1, step: 0.02 },
  armClump: { min: 0, max: 1, step: 0.02 },
  armWave: { min: 0, max: 1, step: 0.02 },
  barStrength: { min: 0.4, max: 1.6, step: 0.05 },
  dust: { min: 0, max: 0.7, step: 0.05 },
  dustNoise: { min: 0, max: 1, step: 0.02 },
  dustNoiseScale: { min: 0.3, max: 3, step: 0.05 },
  youngStars: { min: 0, max: 1, step: 0.02 },
  metallicity: { min: 0, max: 1, step: 0.02 },
  warpStrength: { min: 0, max: 0.3, step: 0.01 },
  warpTwist: { min: 0, max: 6.28, step: 0.05 },
  globularCount: { min: 0, max: 100, step: 5 },
  globularSize: { min: 0.3, max: 2, step: 0.02 },
  globularBright: { min: 0.1, max: 1.5, step: 0.02 },
};
