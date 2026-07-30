import type { GalaxyCatalogSourceType } from '../data/galaxyCatalog/GalaxyCatalogSourceType';

/**
 * GalaxyRow — the serializable projection of a single galaxy's CLOUD-SOURCED
 * primitives, extracted engine-side (it touches the GPU-adjacent CPU cloud
 * arrays) so React can build the heavy `GalaxyInfo` from it purely.
 *
 * It is exactly the raw inputs `buildGalaxyInfo` needs — positions, the stored
 * spectroscopic redshift, the five mag slots, diameter, orientation, the
 * per-record class/parent bytes, plus the optional famous-galaxies-meta block — and
 * nothing derived. Every derived field (sexagesimal, distance, colours, urls,
 * provenance) is a PURE function of these, so it computes React-side.
 *
 * `objId` is a STRING, not a bigint: this row is stored in the RTK
 * `selectionRows` slice, where the serializability check is on. The string is
 * the decimal form of the catalog `objID`; `buildGalaxyInfo` parses it back to
 * a bigint with `BigInt(objId)` where the URL/name logic needs it.
 */
export type GalaxyRow = {
  readonly type: 'galaxyCatalog';
  readonly source: GalaxyCatalogSourceType;
  readonly index: number;
  readonly objId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly redshift: number;
  readonly magU: number;
  readonly magG: number;
  readonly magR: number;
  readonly magI: number;
  readonly magZ: number;
  readonly diameterKpc: number;
  readonly axisRatio: number;
  readonly positionAngleDeg: number;
  /**
   * True when (axisRatio, positionAngleDeg) is a deterministic hash fallback
   * rather than a real measurement — the authoritative persisted flag,
   * threaded straight from `cloud.orientationIsFallback`. Drives the
   * InfoCard's "measured vs estimated" orientation provenance without
   * re-hashing from position (which was lossy).
   */
  readonly orientationIsFallback: boolean;
  /**
   * True when `diameterKpc` is the flat 30 kpc fallback rather than a real
   * measurement — the authoritative persisted flag, threaded straight from
   * `cloud.diameterIsFallback`. Drives the InfoCard's diameter provenance tag,
   * replacing the old `diameterKpc === 30` compare (lossy: a genuinely
   * measured 30 kpc galaxy would have been mislabeled fallback).
   */
  readonly diameterIsFallback: boolean;
  readonly classByte: number;
  readonly parentSurveyByte: number;
  readonly famous?: {
    readonly id: string;
    readonly commonName?: string;
    readonly names: readonly string[];
    readonly description: string;
    readonly type: string;
  };
};
