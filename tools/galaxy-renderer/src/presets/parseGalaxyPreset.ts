/**
 * parseGalaxyPreset — the read side of the preset wire format (see
 * `serializeGalaxyPreset`'s header for the split-vs-flat rationale).
 *
 * Validation mirrors the spike's `onUploadFile` (`Galaxy Renderer.dc.html:654`,
 * `if (o && o.p)`), made total: unparseable JSON or a payload without an
 * object-shaped `p` yields `null` instead of throwing or silently producing
 * `undefined` fields. A missing `r` is tolerated (the spike merged
 * `o.r || {}`) and treated as an empty bag.
 *
 * The flat `r` bag is split back into `render` vs `lod` by key — `lodApparent`
 * is the only `LodSettings` field (see `LodSettings.d.ts`); everything else in
 * `r` is a `RenderSettings` field. A key belonging to neither (an older
 * preset's since-removed knob) lands in `render`, where the slice's shallow
 * merge simply carries it as an unread extra rather than throwing.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';

const LOD_KEYS: readonly string[] = ['lodApparent'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseGalaxyPreset(json: string): {
  readonly p: Partial<GalaxyParams>;
  readonly r: Partial<RenderSettings>;
  readonly lod: Partial<LodSettings>;
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
  };
}
