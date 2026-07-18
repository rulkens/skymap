/**
 * serializeGalaxyPreset — the JSON wire format for a saved/shared galaxy
 * preset, byte-for-byte compatible with the spike's `downloadJSON`
 * (`Galaxy Renderer.dc.html:640`): `{ type: 'galaxy-preset', version: 1, p, r }`.
 *
 * The spike's `r` bag was a flat merge of render + LOD knobs — there was no
 * split, because the spike had no split to preserve. This port's STORE keeps
 * `RenderSettings` and `LodSettings` as separate slices (they map to two
 * different GPU uniform buffers — see `RenderSettings.d.ts`'s header), but
 * the WIRE format has no reason to inherit that boundary: it's an external
 * contract, and flattening it back to the spike's shape is what makes old
 * exported presets (and this format) round-trip through either shape. This
 * function is the one place that folds the two slices back into the flat
 * `r` bag; `parseGalaxyPreset` is the one place that splits it apart again.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';

export function serializeGalaxyPreset(
  galaxy: GalaxyParams,
  render: RenderSettings,
  lod: LodSettings,
): string {
  return JSON.stringify(
    {
      type: 'galaxy-preset',
      version: 1,
      p: galaxy,
      r: { ...render, ...lod },
    },
    null,
    2,
  );
}
