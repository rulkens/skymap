/**
 * parseGalaxyPreset — the read side of the preset wire format (see
 * `serializeGalaxyPreset`'s header). Total, like the spike's `onUploadFile`:
 * bad JSON or a non-object `p` yields `null`; `r`/`f`/`x` tolerate missing or
 * non-object (empty bag) — deliberate, this file has never had a validation
 * framework, so a malformed nested value still reaches the store as-is. `f`
 * is additionally routed through `migrateGalaxyFieldTuningWire` to lift a v2
 * file's flat keys into v3's nested-by-section shape, AND (passing `p`
 * alongside) an even older preset's `dust`/`starFormation` off `p` itself —
 * see that function's header. `r` splits back into `render`/`lod` by key:
 * `lodApparent` is the only `LodSettings` field.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';
import type { ExtrasState } from '../../@types/state/ExtrasState';
import { migrateGalaxyFieldTuningWire } from './migrateGalaxyFieldTuningWire';

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
    else render[key] = value;
  }

  return {
    p: parsed.p as Partial<GalaxyParams>,
    r: render as Partial<RenderSettings>,
    lod: lod as Partial<LodSettings>,
    f: migrateGalaxyFieldTuningWire(isPlainObject(parsed.f) ? parsed.f : {}, parsed.p),
    x: (isPlainObject(parsed.x) ? parsed.x : {}) as Partial<Pick<ExtrasState, 'enabled' | 'count'>>,
  };
}
