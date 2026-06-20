import type { GalaxyCatalogSourceType } from '../data/galaxyCatalog/GalaxyCatalogSourceType';

/**
 * GalaxyRow — the serializable projection of a single galaxy's CLOUD-SOURCED
 * primitives, extracted engine-side (it touches the GPU-adjacent CPU cloud
 * arrays) so React can build the heavy `GalaxyInfo` from it purely.
 *
 * It is exactly the raw inputs `buildGalaxyInfo` needs — positions, the stored
 * spectroscopic redshift, the five mag slots, diameter, orientation, the
 * per-record class/parent bytes, plus the optional famous-meta block — and
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
