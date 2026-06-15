/**
 * SELECTION_HALO — per-kind descriptor for a target's selection halo, keyed on
 * the FocusableTarget union tag: the characteristic world radius (Mpc) that
 * sizes the ring, plus the world position to centre it on. A galaxy uses its
 * catalog diameter (with a synthetic-fallback floor); the Milky Way its disc
 * radius; a structure returns null because it renders its ring through the
 * cluster marker pass, not this one.
 *
 * Radius and position travel together because both are per-kind facts the halo
 * needs, and because galaxy/Milky-Way carry flat `x/y/z` while a structure
 * names its position `worldPos` — folding the position into the table lets the
 * caller read it off the (non-null) descriptor without re-narrowing the union.
 * selectionRingPass both gates on and sizes from this table, so "which kinds get
 * a halo here, and where" lives in one place: a new halo-bearing kind is one row.
 */
import { MILKY_WAY_DISC_RADIUS_KPC } from '../../../data/milkyWay/galacticCenter';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { FocusableTargetType } from '../../../@types/engine/FocusableTargetType';
import type { Vec3 } from '../../../@types/math/Vec3';

export type SelectionHalo = {
  readonly radiusMpc: number;
  readonly worldPos: Vec3;
};

export const SELECTION_HALO: Record<
  FocusableTargetType,
  (t: FocusableTarget) => SelectionHalo | null
> = {
  // `max(diameterKpc, 30)` handles the synthetic-fallback source and any
  // pre-v4-format galaxy without a measured size; *2 = diameter→radius span.
  galaxyCatalog: (t) =>
    t.type === 'galaxyCatalog'
      ? {
          radiusMpc: ((t.diameterKpc > 0 ? t.diameterKpc : 30) * 2) / 1000,
          worldPos: [t.x, t.y, t.z],
        }
      : null,
  milkyWay: (t) =>
    t.type === 'milkyWay'
      ? { radiusMpc: MILKY_WAY_DISC_RADIUS_KPC / 1000, worldPos: [t.x, t.y, t.z] }
      : null,
  // Structures render their ring through the cluster marker pass.
  structure: () => null,
};
