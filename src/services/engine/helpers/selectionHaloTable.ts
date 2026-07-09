/**
 * selectionHalo — per-kind halo descriptor for a selected thing, keyed on the
 * SelectionRow union tag: the characteristic world radius (Mpc) that sizes the
 * ring, plus the world position to centre it on.
 *
 * A galaxy uses its catalog diameter (with a synthetic-fallback floor); the
 * Milky Way its disc radius anchored at the galactic centre; a structure
 * returns null because it renders its ring through the cluster marker pass,
 * not this one.
 *
 * Radius and position travel together because both are per-kind facts the halo
 * needs, and because galaxy/Milky-Way carry their world position differently —
 * a GalaxyRow has flat `x/y/z` while the milkyWay row is a bare singleton tag
 * that looks up `MILKY_WAY_CENTER_WORLD` here. Folding the position into the
 * table lets the caller read it off the (non-null) descriptor without
 * re-narrowing the union. `selectionRingLayer` both gates on and sizes from this
 * table, so "which kinds get a halo here, and where" lives in one place: a new
 * halo-bearing kind is one table row.
 */
import {
  MILKY_WAY_DISC_RADIUS_KPC,
  MILKY_WAY_CENTER_WORLD,
} from '../../../data/milkyWay/galacticCenter';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { GalaxyRow } from '../../../@types/engine/GalaxyRow';
import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';
import type { Vec3 } from '../../../@types/math/Vec3';

export type SelectionHalo = {
  readonly radiusMpc: number;
  readonly worldPos: Vec3;
};

type MilkyWayRow = { readonly type: 'milkyWay' };

// Table keyed on the SelectionRow union tag. Each arm receives the narrowed row
// and returns a descriptor (or null for the structure arm, which uses the
// cluster marker pass instead).
const SELECTION_HALO_TABLE: {
  galaxyCatalog: (row: GalaxyRow) => SelectionHalo;
  milkyWay: (row: MilkyWayRow) => SelectionHalo;
  structure: (row: StructureInfo) => null;
} = {
  // `max(diameterKpc, 30)` handles the synthetic-fallback source and any
  // pre-v4-format galaxy without a measured size; *2 = diameter→radius span.
  galaxyCatalog: (row) => ({
    radiusMpc: ((row.diameterKpc > 0 ? row.diameterKpc : 30) * 2) / 1000,
    worldPos: [row.x, row.y, row.z],
  }),
  // The milkyWay row is a bare singleton tag — position comes from the
  // galactic-centre constant, disc radius from the published stellar-disc size.
  milkyWay: (_row) => ({
    radiusMpc: MILKY_WAY_DISC_RADIUS_KPC / 1000,
    worldPos: [MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]],
  }),
  // Structures render their ring through the cluster marker pass.
  structure: (_row) => null,
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
