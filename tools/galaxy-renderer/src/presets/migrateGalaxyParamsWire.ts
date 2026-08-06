/**
 * migrateGalaxyParamsWire — lifts a v3-or-older preset's FLAT `p.<key>` keys
 * into `GalaxyParams` v4's `shared`/`legacy` bags (see that type's header for
 * the split). Mirrors `migrateGalaxyFieldTuningWire`'s shape: total, and a
 * key naming neither bag (an unknown field, or `dust`/`starFormation` — the
 * fields the 2026-08-06 reshape moved onto `f`) is silently dropped rather
 * than rejected.
 *
 * `parseGalaxyPreset` runs this on the preset's RAW `p` and, independently,
 * hands that SAME raw `p` to `migrateGalaxyFieldTuningWire` for its own
 * `p.dust`/`p.starFormation` lift — this migrator dropping those two keys
 * from ITS OWN output never starves that lift, since it never sees this
 * migrator's output at all.
 *
 * A v4 preset (already `{ type, shared, legacy }`) passes through untouched —
 * idempotent, so re-parsing a freshly-saved file is a no-op.
 */
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import { GALAXY_LEGACY_PARAM_KEYS } from '../data/galaxyLegacyParamKeys';
import { GALAXY_SHARED_PARAM_KEYS } from '../data/galaxySharedParamKeys';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function migrateGalaxyParamsWire(raw: Record<string, unknown>): Partial<GalaxyParams> {
  const out: Record<string, unknown> = {};
  if ('type' in raw) out.type = raw.type;

  if ('shared' in raw || 'legacy' in raw) {
    if (isPlainObject(raw.shared)) out.shared = raw.shared;
    if (isPlainObject(raw.legacy)) out.legacy = raw.legacy;
    return out as Partial<GalaxyParams>;
  }

  const shared: Record<string, unknown> = {};
  const legacy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'type') continue;
    if ((GALAXY_SHARED_PARAM_KEYS as ReadonlySet<string>).has(key)) shared[key] = value;
    else if ((GALAXY_LEGACY_PARAM_KEYS as ReadonlySet<string>).has(key)) legacy[key] = value;
  }
  // A section is emitted only when the payload actually named one of its
  // keys — same discipline as `migrateGalaxyFieldTuningWire`'s SECTION_KEYS
  // loop, so a v1 preset naming only `type` round-trips as `{ type }`, not
  // `{ type, shared: {} }`.
  if (Object.keys(shared).length > 0) out.shared = shared;
  if (Object.keys(legacy).length > 0) out.legacy = legacy;
  return out as Partial<GalaxyParams>;
}
