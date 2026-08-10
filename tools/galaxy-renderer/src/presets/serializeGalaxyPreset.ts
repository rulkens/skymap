/**
 * serializeGalaxyPreset — the JSON wire format for a saved/shared galaxy
 * preset: `{ type, version, p, r, f, x }`. `r` flattens `RenderSettings` +
 * `LodSettings` into one wire bag; `parseGalaxyPreset` splits it back apart.
 * `x` carries extras' `enabled`/`count` (`regenNonce` dropped — a re-roll
 * trigger, not a seed). v3 nests `f` (`GalaxyFieldTuning`) by UI section
 * instead of v2's flat keys; v4 nests `p` (`GalaxyParams`) into its
 * `shared`/`legacy` bags instead of v3's flat keys — see
 * `parseGalaxyPreset`'s header for the fallback chain and
 * `migrateGalaxyFieldTuningWire`/`migrateGalaxyParamsWire`'s headers for the
 * lifts.
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
      version: 4,
      p: galaxy,
      r: { ...render, ...lod },
      f: fieldTuning,
      x: { enabled: extras.enabled, count: extras.count },
    },
    null,
    2,
  );
}
