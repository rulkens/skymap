/**
 * parseGalaxyPreset — the read side of the preset wire format (see
 * `serializeGalaxyPreset`'s header). Total, like the spike's `onUploadFile`:
 * bad JSON or a non-object `p` yields `null`; `r`/`f`/`x` tolerate missing or
 * non-object input — this file has never had a validation framework, so a
 * malformed nested value still reaches the store as-is.
 *
 * `p` routes through `migrateGalaxyParamsWire`, `f` through
 * `migrateGalaxyFieldTuningWire` (passing the RAW, unmigrated `p` alongside
 * for its own `dust`/`starFormation` lift — see that migrator's header). `r`
 * splits back into `render`/`lod` by key: `lodApparent` is the only
 * `LodSettings` field.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';
import type { ExtrasState } from '../../@types/state/ExtrasState';
import { migrateGalaxyFieldTuningWire } from './migrateGalaxyFieldTuningWire';
import { migrateGalaxyParamsWire } from './migrateGalaxyParamsWire';

const LOD_KEYS: readonly string[] = ['lodApparent'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseGalaxyPreset(json: string): {
  readonly p: Partial<GalaxyParams>;
  readonly r: Partial<RenderSettings>;
  readonly lod: Partial<LodSettings>;
  readonly f: Partial<GalaxyFieldTuning>;
  readonly x: Partial<Pick<ExtrasState, 'enabled' | 'count'>>;
} | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed) || !isPlainObject(parsed.p)) return null;

  const flatR = isPlainObject(parsed.r) ? parsed.r : {};
  const render: Record<string, unknown> = {};
  const lod: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flatR)) {
    if (LOD_KEYS.includes(key)) lod[key] = value;
    // Pre-rename presets carry one of two old spellings of the stars channel
    // weight (`ismMapRecentWeight` predates the recentSf unification,
    // `ismMapRecentSfWeight` is that unification's own name, since replaced
    // by the tracer rename) — remap both so a saved debug-view setup
    // survives either rename.
    else if (key === 'ismMapRecentWeight' || key === 'ismMapRecentSfWeight') {
      render.ismMapStarsWeight = value;
    }
    // Pre-rename presets spell the `hii:extras` pass's divisor `hiiDivisor`,
    // from before HII_TIERS gave shells/young/dig their own targets and
    // divisors and left this one governing extras alone.
    else if (key === 'hiiDivisor') {
      render.extrasDivisor = value;
    }
    // Pre-split presets carry one flat `starGrainFeatureScale`, from before
    // the near/far distance blend existed — both ends get the same value,
    // degrading to the old static behaviour.
    else if (key === 'starGrainFeatureScale') {
      render.starGrainFeatureScaleNear = value;
      render.starGrainFeatureScaleFar = value;
    } else render[key] = value;
  }

  return {
    p: migrateGalaxyParamsWire(parsed.p),
    r: render as Partial<RenderSettings>,
    lod: lod as Partial<LodSettings>,
    f: migrateGalaxyFieldTuningWire(isPlainObject(parsed.f) ? parsed.f : {}, parsed.p),
    x: (isPlainObject(parsed.x) ? parsed.x : {}) as Partial<Pick<ExtrasState, 'enabled' | 'count'>>,
  };
}
