/**
 * selectionHalo — per-kind halo descriptor keyed on the SelectionRow tag: ring radius (Mpc),
 * world position and depth slab. Near-field kinds carry a REAL physical radius so the NEAR0 ring
 * wraps the rendered sphere. Structures and the zone of avoidance return null.
 *
 * `slab` lets a COSMO and a NEAR0 ring layer share one `selectionRingRenderer` without racing:
 * each draws only halos tagged with its slab, so one writes the shared uniform buffers per
 * frame (`near0SelectionRingPass`). Near-field anchors fall outside COSMO's fixed planes.
 */
import {
  MILKY_WAY_DISC_RADIUS_KPC,
  MILKY_WAY_CENTER_WORLD,
} from '../../../data/milkyWay/galacticCenter';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { NEAR0, COSMO } from '../frame/slabs';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { GalaxyRow } from '../../../@types/engine/GalaxyRow';
import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';
import type { Vec3 } from '../../../@types/math/Vec3';

type SelectionHalo = {
  readonly radiusMpc: number;
  readonly worldPos: Vec3;
  /** The depth slab (`NEAR0`/`COSMO`) whose frustum contains `worldPos`. */
  readonly slab: number;
};

type MilkyWayRow = { readonly type: 'milkyWay' };
type ZoneOfAvoidanceRow = { readonly type: 'zoneOfAvoidance' };
type BodyRow = Extract<SelectionRow, { type: 'body' }>;
type CraftRow = Extract<SelectionRow, { type: 'craft' }>;
type EarthSceneRow = Extract<SelectionRow, { type: 'earthScene' }>;
type StarCatalogRow = Extract<SelectionRow, { type: 'starCatalog' }>;
type BlackHoleRow = Extract<SelectionRow, { type: 'blackHole' }>;
type SatelliteRow = Extract<SelectionRow, { type: 'satellite' }>;

const SELECTION_HALO_TABLE: {
  galaxyCatalog: (row: GalaxyRow) => SelectionHalo;
  milkyWay: (row: MilkyWayRow) => SelectionHalo;
  structure: (row: StructureInfo) => null;
  zoneOfAvoidance: (row: ZoneOfAvoidanceRow) => null;
  body: (row: BodyRow) => SelectionHalo;
  craft: (row: CraftRow) => SelectionHalo;
  earthScene: (row: EarthSceneRow) => SelectionHalo;
  starCatalog: (row: StarCatalogRow) => SelectionHalo;
  blackHole: (row: BlackHoleRow) => SelectionHalo;
  satellite: (row: SatelliteRow) => SelectionHalo;
} = {
  // 30 kpc fallback for a galaxy without a measured size; the ring spans 2x the diameter.
  galaxyCatalog: (row) => ({
    radiusMpc: ((row.diameterKpc > 0 ? row.diameterKpc : 30) * 2) / 1000,
    worldPos: [row.x, row.y, row.z],
    slab: COSMO,
  }),
  // The row is a bare singleton tag, so position is the galactic-centre constant.
  milkyWay: (_row) => ({
    radiusMpc: MILKY_WAY_DISC_RADIUS_KPC / 1000,
    worldPos: [MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]],
    slab: COSMO,
  }),
  structure: (_row) => null,
  zoneOfAvoidance: (_row) => null,
  // The ring rides the driver's footprint; far away `near0RingRadiusPx` floors it to a px minimum.
  body: nearFieldHalo,
  craft: nearFieldHalo,
  earthScene: nearFieldHalo,
  starCatalog: nearFieldHalo,
  // Footprint is r_s: the ring hugs the horizon.
  blackHole: nearFieldHalo,
  satellite: nearFieldHalo,
};

function nearFieldHalo(
  row: BodyRow | CraftRow | EarthSceneRow | StarCatalogRow | BlackHoleRow | SatelliteRow,
): SelectionHalo {
  return {
    radiusMpc: row.driver.footprintRadiusM * SCALE_UNITS.M_TO_MPC,
    worldPos: [row.positionMpc[0], row.positionMpc[1], row.positionMpc[2]],
    slab: NEAR0,
  };
}

export function selectionHalo(row: SelectionRow | null): SelectionHalo | null {
  if (row === null) return null;
  return SELECTION_HALO_TABLE[row.type](row as never);
}
