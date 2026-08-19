/**
 * selectionHalo — per-kind halo descriptor for a selected thing, keyed on the
 * SelectionRow union tag: the characteristic world radius (Mpc) that sizes the
 * ring, the world position to centre it on, and the depth slab whose frustum
 * that position lives in.
 *
 * A galaxy uses its catalog diameter (with a synthetic-fallback floor); the
 * Milky Way its disc radius anchored at the galactic centre; a scene body (a
 * planet, a famous star, Earth) and a survey star each carry a REAL physical
 * radius — `radiusKm` converted to Mpc — so the NEAR0 ring layer can wrap the
 * rendered sphere on close approach instead of floating a fixed-px dot inside
 * it (`near0RingRadiusPx` floors to a px minimum far away, then tracks 1.5× the
 * sphere's apparent radius once it resolves). A structure returns null because
 * it renders its ring through the cluster marker pass, not this one.
 *
 * Radius, position, and slab travel together because all three are per-kind
 * facts the halo needs, and because galaxy/Milky-Way carry their world position
 * differently — a GalaxyRow has flat `x/y/z` while the milkyWay row is a bare
 * singleton tag that looks up `MILKY_WAY_CENTER_WORLD` here. Folding the
 * position into the table lets the caller read it off the (non-null) descriptor
 * without re-narrowing the union. `selectionRingLayer` both gates on and sizes
 * from this table, so "which kinds get a halo here, and where" lives in one
 * place: a new halo-bearing kind is one table row.
 *
 * The `slab` field is what lets two thin ring layers — a COSMO one and a NEAR0
 * one — share the single `selectionRingRenderer` without racing: each layer
 * draws only the halos tagged with its own slab, so exactly one writes the
 * renderer's shared uniform buffers per frame (see `near0SelectionRingLayer`'s
 * header for the full writeBuffer/submit argument). A galaxy or the Milky Way
 * rings through COSMO (Mpc scale); a survey star and the foreground scene bodies
 * (planet / famous star / Earth) ring through NEAR0 (their parsec/AU-scale
 * anchors fall inside COSMO's fixed near plane and outside its far plane once
 * rebased). The slab value reuses the `NEAR0`/`COSMO` index constants a layer's
 * `slab:` field already carries — not a parallel union.
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

export type SelectionHalo = {
  readonly radiusMpc: number;
  readonly worldPos: Vec3;
  /** The depth slab (`NEAR0`/`COSMO`) whose frustum contains `worldPos`. */
  readonly slab: number;
};

type MilkyWayRow = { readonly type: 'milkyWay' };
type ZoneOfAvoidanceRow = { readonly type: 'zoneOfAvoidance' };
type BodyRow = Extract<SelectionRow, { type: 'body' }>;
type StarRow = Extract<SelectionRow, { type: 'star' }>;

// Table keyed on the SelectionRow union tag. Each arm receives the narrowed row
// and returns a descriptor (or null for the structure/zoneOfAvoidance arms,
// which have no ring center — a structure uses the cluster marker pass
// instead, and the band is a line-of-sight effect with no point to ring).
const SELECTION_HALO_TABLE: {
  galaxyCatalog: (row: GalaxyRow) => SelectionHalo;
  milkyWay: (row: MilkyWayRow) => SelectionHalo;
  structure: (row: StructureInfo) => null;
  zoneOfAvoidance: (row: ZoneOfAvoidanceRow) => null;
  body: (row: BodyRow) => SelectionHalo;
  star: (row: StarRow) => SelectionHalo;
} = {
  // `max(diameterKpc, 30)` handles the synthetic-fallback source and any
  // pre-v4-format galaxy without a measured size; *2 = diameter→radius span.
  galaxyCatalog: (row) => ({
    radiusMpc: ((row.diameterKpc > 0 ? row.diameterKpc : 30) * 2) / 1000,
    worldPos: [row.x, row.y, row.z],
    slab: COSMO,
  }),
  // The milkyWay row is a bare singleton tag — position comes from the
  // galactic-centre constant, disc radius from the published stellar-disc size.
  milkyWay: (_row) => ({
    radiusMpc: MILKY_WAY_DISC_RADIUS_KPC / 1000,
    worldPos: [MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]],
    slab: COSMO,
  }),
  // Structures render their ring through the cluster marker pass.
  structure: (_row) => null,
  // The band has no ring center — it's a line-of-sight effect along the whole
  // galactic plane, not a point selection.
  zoneOfAvoidance: (_row) => null,
  // A scene body (planet / famous star / Earth) is drawn as a real sphere, so
  // its ring rides its true physical radius — `radiusKm` → Mpc — letting the
  // NEAR0 ring layer (§9) wrap the sphere on close approach (far away
  // `near0RingRadiusPx` floors it to a px minimum). The NEAR0 slab tag routes
  // it through `near0SelectionRingLayer` (not the COSMO layer), so the two
  // layers stay slab-exclusive on the shared renderer.
  body: (row) => ({
    radiusMpc: row.radiusKm * SCALE_UNITS.KM_TO_MPC,
    worldPos: [row.positionMpc[0], row.positionMpc[1], row.positionMpc[2]],
    slab: NEAR0,
  }),
  // A survey star carries the nominal solar radius (`radiusKm`, stamped by the
  // extractor) and resolves to a sphere on close approach, so its ring rides
  // that physical radius in Mpc too — same NEAR0 treatment as a scene body.
  star: (row) => ({
    radiusMpc: row.radiusKm * SCALE_UNITS.KM_TO_MPC,
    worldPos: [row.positionMpc[0], row.positionMpc[1], row.positionMpc[2]],
    slab: NEAR0,
  }),
};

/**
 * selectionHalo — dispatch wrapper for the per-kind halo table.
 *
 * Returns the halo descriptor for the given SelectionRow, or null when the row
 * is null (nothing selected) or a structure (uses the marker pass instead).
 */
export function selectionHalo(row: SelectionRow | null): SelectionHalo | null {
  if (row === null) return null;
  return SELECTION_HALO_TABLE[row.type](row as never);
}
