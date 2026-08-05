/**
 * migrateGalaxyFieldTuningWire — lifts a v2 preset's FLAT `f` keys into their
 * v3 nested homes, AND retires the two dead boolean gates the three-state
 * generator dropdown replaced (`sfMap.enabled`, `dust.sfMapSeeding`) — see
 * `GalaxySfMapGeneratorKind`. Exists because presets already saved to disk
 * carry the old shapes forever; `parseGalaxyPreset` routes every `f` through
 * this before handing it to the store. Total, per this parser's
 * no-validation contract (see `parseGalaxyPreset`'s header). A section is
 * emitted only when the payload actually named one of its keys, so an absent
 * section stays absent — which is what makes loading a partial preset leave
 * the rest of the tuning alone.
 */
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';

const SECTION_KEYS = [
  'disc',
  'arms',
  'dust',
  'hii',
  'sfMap',
  'sfMapAutomaton',
  'sfMapFluid',
] as const;

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
 * `sfMap.enabled === false` becomes `generator: 'none'`; otherwise the
 * preset's own generator survives (defaulted if the section never named one —
 * a bare `{ enabled: true }` section, say). Either way `enabled` itself is
 * dropped: a stale `enabled: false` sitting beside a real `generator` would
 * silently look meaningful to the next reader.
 */
function migrateSfMap(sfMap: Record<string, unknown>): Record<string, unknown> {
  const { enabled, ...rest } = sfMap;
  if (enabled === false) return { ...rest, generator: 'none' };
  return 'generator' in rest
    ? rest
    : { ...rest, generator: DEFAULT_GALAXY_FIELD_TUNING.sfMap.generator };
}

/** Drops the retired `dust.sfMapSeeding` gate — seeding is now implied by `sfMap.generator !== 'none'`. */
function migrateDust(dust: Record<string, unknown>): Record<string, unknown> {
  const { sfMapSeeding: _sfMapSeeding, ...rest } = dust;
  return rest;
}

export function migrateGalaxyFieldTuningWire(
  raw: Record<string, unknown>,
): Partial<GalaxyFieldTuning> {
  const out: Record<string, unknown> = {};
  for (const key of SECTION_KEYS) {
    if (key in raw) out[key] = raw[key];
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

  if (out.sfMap) out.sfMap = migrateSfMap(out.sfMap as Record<string, unknown>);
  if (out.dust) out.dust = migrateDust(out.dust as Record<string, unknown>);

  // `fieldTuningPatched` Object.assigns a whole section over the store's
  // tuning (cheap, live-slider path too — no deep merge there). A preset
  // saved before a field existed would upload it `undefined`, and
  // `packSfMapFluidConstants` writes that straight into a Float32Array slot
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
