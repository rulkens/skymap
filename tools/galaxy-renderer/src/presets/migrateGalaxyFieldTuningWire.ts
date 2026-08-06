/**
 * migrateGalaxyFieldTuningWire — lifts a v2 preset's FLAT `f` keys into their
 * v3 nested homes, retires the two dead boolean gates the three-state
 * generator dropdown replaced (`sfMap.enabled`, `dust.sfMapSeeding` — see
 * `GalaxyIsmMapGeneratorKind`), lifts the pre-ISM-rename `sfMap*` wire
 * spellings onto their `ismMap*` homes, AND lifts `dust`/`starFormation` off
 * an even older preset's `p` (`GalaxyParams` dropped both fields — see
 * `GalaxyFieldTuning`'s header). Exists because presets already saved carry
 * the old shapes forever; `parseGalaxyPreset` routes every `f` (plus its own
 * `p`, for the `legacyParams` lift) through this before handing it to the
 * store. Total, per this parser's no-validation contract (see
 * `parseGalaxyPreset`'s header). A section is emitted only when the payload
 * actually named one of its keys (on `f` OR, for `dust`/`starFormation`, on
 * legacy `p`), so an absent section stays absent — which is what makes
 * loading a partial preset leave the rest of the tuning alone.
 */
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';

const SECTION_KEYS = [
  'disc',
  'arms',
  'dust',
  'starFormation',
  'hii',
  'ismMap',
  'ismMapAutomaton',
  'ismMapFluid',
] as const;

/**
 * Pre-ISM-rename presets carry these spellings forever; the sf* strings here
 * are deliberate legacy wire keys, not a missed rename sweep. A section's old
 * key only applies when the new one is absent, so a hand-merged preset naming
 * both keeps the new spelling.
 */
const LEGACY_SECTION_KEYS: Readonly<Record<string, (typeof SECTION_KEYS)[number]>> = {
  sfMap: 'ismMap',
  sfMapAutomaton: 'ismMapAutomaton',
  sfMapFluid: 'ismMapFluid',
};

/** Same vintage, one level down: fields renamed in place inside a surviving section. */
const LEGACY_FIELD_RENAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  hii: { sfMapSeeding: 'ismMapSeeding' },
};

/** v2 flat key -> where it lands, `arms.cloud` spelled as the two hops it is. */
const V2_FLAT_PATHS: Readonly<Record<string, readonly [string, ...string[]]>> = {
  discEnabled: ['disc', 'enabled'],
  armsEnabled: ['arms', 'enabled'],
  armWidthScale: ['arms', 'widthScale'],
  armContrast: ['arms', 'contrast'],
  armExcessScaleRatio: ['arms', 'excessScaleRatio'],
  armBlobSharpness: ['arms', 'blobSharpness'],
  armCloudEnabled: ['arms', 'cloud', 'enabled'],
  armCloudShare: ['arms', 'cloud', 'share'],
  armCloudCoverage: ['arms', 'cloud', 'coverage'],
  armCloudRadialBias: ['arms', 'cloud', 'radialBias'],
  armCloudClumpiness: ['arms', 'cloud', 'clumpiness'],
  armCloudSizeScale: ['arms', 'cloud', 'sizeScale'],
  armCloudElongation: ['arms', 'cloud', 'elongation'],
  dustEnabled: ['dust', 'enabled'],
  hiiEnabled: ['hii', 'enabled'],
  hiiBrightness: ['hii', 'brightness'],
  hiiRadiusScale: ['hii', 'radiusScale'],
  hiiShellThickness: ['hii', 'shellThickness'],
  hiiClusterStrength: ['hii', 'clusterStrength'],
  hiiCavityScale: ['hii', 'cavityScale'],
};

/**
 * `ismMap.enabled === false` becomes `generator: 'none'`; otherwise the
 * preset's own generator survives (defaulted if the section never named one —
 * a bare `{ enabled: true }` section, say). Either way `enabled` itself is
 * dropped: a stale `enabled: false` sitting beside a real `generator` would
 * silently look meaningful to the next reader.
 */
function migrateIsmMap(ismMap: Record<string, unknown>): Record<string, unknown> {
  const { enabled, ...rest } = ismMap;
  if (enabled === false) return { ...rest, generator: 'none' };
  return 'generator' in rest
    ? rest
    : { ...rest, generator: DEFAULT_GALAXY_FIELD_TUNING.ismMap.generator };
}

/**
 * Drops the retired `dust.sfMapSeeding` gate (its legacy wire spelling —
 * retired before the ISM rename, so no preset ever wrote an ism variant) —
 * seeding is now implied by `ismMap.generator !== 'none'`.
 */
function migrateDust(dust: Record<string, unknown>): Record<string, unknown> {
  const { sfMapSeeding: _sfMapSeeding, ...rest } = dust;
  return rest;
}

/**
 * `dust`/`starFormation` used to live on `p` (`GalaxyParams`), with `dust`
 * additionally split against this section's own `enabled`-only bag (the old
 * `GalaxyDustTuning`) — a REAL preset from that era names both at once. The
 * lifted `p` shape is the base and `raw`'s own `f.dust`/`f.starFormation`
 * (whatever it named, historically just `enabled`) wins per-key over it, so
 * an old preset's tuned tau/scaleLenRatio/etc. survive rather than being
 * discarded in favour of a generic default. Runs before the defaults-fill
 * pass below, same ordering requirement as `migrateIsmMap`.
 */
const LIFT_FROM_PARAMS_KEYS = ['dust', 'starFormation'] as const;

function liftLegacyParamSections(
  out: Record<string, unknown>,
  legacyParams: Record<string, unknown> | undefined,
): void {
  if (!legacyParams) return;
  for (const key of LIFT_FROM_PARAMS_KEYS) {
    const fromParams = legacyParams[key];
    if (typeof fromParams !== 'object' || fromParams === null) continue;
    const fromRaw = out[key] as Record<string, unknown> | undefined;
    out[key] = { ...(fromParams as Record<string, unknown>), ...fromRaw };
  }
}

export function migrateGalaxyFieldTuningWire(
  raw: Record<string, unknown>,
  legacyParams?: Record<string, unknown>,
): Partial<GalaxyFieldTuning> {
  const out: Record<string, unknown> = {};
  for (const key of SECTION_KEYS) {
    if (key in raw) out[key] = raw[key];
  }
  for (const [legacy, key] of Object.entries(LEGACY_SECTION_KEYS)) {
    if (legacy in raw && !(key in out)) out[key] = raw[legacy];
  }

  for (const [flatKey, path] of Object.entries(V2_FLAT_PATHS)) {
    if (!(flatKey in raw)) continue;
    let node = out;
    for (const step of path.slice(0, -1)) {
      // Copy rather than mutate: `raw`'s own nested objects are the caller's.
      node[step] = { ...(node[step] as Record<string, unknown> | undefined) };
      node = node[step] as Record<string, unknown>;
    }
    node[path[path.length - 1]!] = raw[flatKey];
  }

  liftLegacyParamSections(out, legacyParams);

  if (out.ismMap) out.ismMap = migrateIsmMap(out.ismMap as Record<string, unknown>);
  if (out.dust) out.dust = migrateDust(out.dust as Record<string, unknown>);

  for (const [section, renames] of Object.entries(LEGACY_FIELD_RENAMES)) {
    if (!out[section]) continue;
    const node = { ...(out[section] as Record<string, unknown>) };
    for (const [legacy, field] of Object.entries(renames)) {
      if (legacy in node) {
        if (!(field in node)) node[field] = node[legacy];
        delete node[legacy];
      }
    }
    out[section] = node;
  }

  // `fieldTuningPatched` Object.assigns a whole section over the store's
  // tuning (cheap, live-slider path too — no deep merge there). A preset
  // saved before a field existed would upload it `undefined`, and
  // `packIsmMapFluidConstants` writes that straight into a Float32Array slot
  // as NaN. Fill every hole from defaults; drop stale/retired keys.
  for (const key of SECTION_KEYS) {
    if (!(key in out)) continue;
    const defaults = DEFAULT_GALAXY_FIELD_TUNING[key] as Record<string, unknown>;
    const migrated = out[key] as Record<string, unknown>;
    const known: Record<string, unknown> = {};
    for (const field of Object.keys(migrated)) {
      if (field in defaults) known[field] = migrated[field];
    }
    out[key] = { ...defaults, ...known };
  }

  return out as Partial<GalaxyFieldTuning>;
}
