/**
 * parseGalaxyPreset — the read side of the preset wire format (see
 * `serializeGalaxyPreset`'s header for field meanings). Total, like the
 * spike's `onUploadFile` (`Galaxy Renderer.dc.html`, `if (o && o.p)`):
 * bad JSON or a non-object `p` yields `null`. `r`/`f`/`x` are each tolerated
 * if missing or non-object (empty bag) — which is also the whole v1 fallback:
 * a v1 file simply has no `f`/`x` keys, so no version branch is needed. Every
 * section gets ONLY this "is it an object" check, never interior validation
 * — a malformed nested value (bad `f.sfMap`, corrupt `r.exposure`) still
 * reaches the store via the caller's patch dispatch. Deliberate: this file
 * has never had a validation framework.
 *
 * `r` is split back into `render`/`lod` by key: `lodApparent` is the only
 * `LodSettings` field, everything else goes to `render` (an unrecognized key
 * lands there too, as an unread extra the slice's merge just carries along).
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';
import type { ExtrasState } from '../../@types/state/ExtrasState';

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
    f: (isPlainObject(parsed.f) ? parsed.f : {}) as Partial<GalaxyFieldTuning>,
    x: (isPlainObject(parsed.x) ? parsed.x : {}) as Partial<Pick<ExtrasState, 'enabled' | 'count'>>,
  };
}
