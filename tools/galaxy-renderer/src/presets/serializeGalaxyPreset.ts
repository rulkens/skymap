/**
 * serializeGalaxyPreset — the JSON wire format for a saved/shared galaxy
 * preset: `{ type, version, p, r, f, x }`. `r` flattens `RenderSettings` +
 * `LodSettings` (two GPU-uniform slices in the store, one bag on the wire —
 * `parseGalaxyPreset` splits it back apart). v1 (spike-compatible,
 * `Galaxy Renderer.dc.html`) had only `p`/`r`. v2 adds `f`
 * (`GalaxyFieldTuning`, sfMap included — now most of a "look") and `x`
 * (extras' `enabled`/`count`; `regenNonce` is dropped — it's a re-roll
 * trigger, not even a seed, since the scatter's randomness lives in the
 * engine's own RNG). See `parseGalaxyPreset`'s header for the v1 fallback.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';
import type { ExtrasState } from '../../@types/state/ExtrasState';

export function serializeGalaxyPreset(
  galaxy: GalaxyParams,
  render: RenderSettings,
  lod: LodSettings,
  fieldTuning: GalaxyFieldTuning,
  extras: Pick<ExtrasState, 'enabled' | 'count'>,
): string {
  return JSON.stringify(
    {
      type: 'galaxy-preset',
      version: 2,
      p: galaxy,
      r: { ...render, ...lod },
      f: fieldTuning,
      x: { enabled: extras.enabled, count: extras.count },
    },
    null,
    2,
  );
}
