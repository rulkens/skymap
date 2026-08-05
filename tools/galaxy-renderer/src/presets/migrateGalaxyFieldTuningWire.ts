/**
 * migrateGalaxyFieldTuningWire — lifts a v2 preset's FLAT `f` keys into their
 * v3 nested homes. Exists because v2 files already saved to disk carry the
 * flat shape forever; `parseGalaxyPreset` routes every `f` through this before
 * handing it to the store. Total, per this parser's no-validation contract
 * (see `parseGalaxyPreset`'s header): a v3 payload carries no flat key and
 * falls through unchanged. A section is emitted only when the payload actually
 * named one of its keys, so an absent section stays absent — which is what
 * makes loading a partial preset leave the rest of the tuning alone.
 */
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';

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
  // Displayed under SF MAP, but it gates the dust cloud — see `GalaxyDustTuning`.
  sfMapDustSeeding: ['dust', 'sfMapSeeding'],
  hiiEnabled: ['hii', 'enabled'],
  hiiBrightness: ['hii', 'brightness'],
  hiiRadiusScale: ['hii', 'radiusScale'],
  hiiShellThickness: ['hii', 'shellThickness'],
  hiiClusterStrength: ['hii', 'clusterStrength'],
  hiiCavityScale: ['hii', 'cavityScale'],
};

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

  return out as Partial<GalaxyFieldTuning>;
}
