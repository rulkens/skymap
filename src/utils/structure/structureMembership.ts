/**
 * structureMembership — pure cone-search over loaded galaxy catalogs.
 *
 * Given a set of in-memory catalogs, a 3D center, and a radius in Mpc,
 * returns the packed (sourceCode << 26 | localIdx) identities of every
 * galaxy strictly inside the sphere — i.e. `distance(g, center) < radius`.
 *
 * ### Why a pure function (no caching here)?
 *
 * The expensive bit is the cone search itself (one vec3 subtract + one
 * dot product per galaxy, ~2.5M ops for the full loaded catalog).
 * Memoising against `(structureId, dataRev)` belongs to the subsystem that
 * owns the focus state — see spec §4.3 — because cache invalidation
 * needs to know when a tier swap has bumped `dataRev`, which this pure
 * function has no concept of. Keeping the function cache-free makes it
 * a single-purpose, easily-tested predicate; the subsystem layered on
 * top adds the lifecycle concerns.
 *
 * ### Why packed IDs (not (source, localIdx) tuples)?
 *
 * The packed-identity encoding is the canonical "global galaxy ID"
 * across the renderer + selection halo + pick buffer (see
 * `selectionEncoding.ts`). Returning packed IDs means the result can
 * be compared directly against `state.selection.selectedPacked` or
 * uploaded as a u32 storage-buffer membership bitmask (future
 * sub-plan 4) without an extra encode step.
 *
 * ### Predicate strictness
 *
 * The comparison is strict `<` (not `≤`) — a galaxy sitting exactly
 * at `r == radiusMpc` is excluded. This makes the ring a hard outer
 * edge, consistent with spec §11.6. The squared-distance comparison
 * (`d2 < r * r`) preserves strictness without the cost of a sqrt.
 */

import { packSelection } from '../../data/selectionEncoding';
import type { Vec3 } from '../../@types/math/Vec3';
import type { CatalogWithSource } from '../../@types/data/structure/CatalogWithSource';
import type { StructureMembershipResult } from '../../@types/data/structure/StructureMembershipResult';

/**
 * Compute the packed identities of every galaxy strictly within
 * `radiusMpc` of `centerMpc` across the supplied catalogs.
 *
 * Time complexity: O(total galaxy count). For the typical loaded
 * footprint (~2.5M galaxies across SDSS + 2MRS + GLADE), one call
 * runs in single-digit milliseconds on the target hardware — see
 * spec §4.2 for the rationale on runtime-vs-build-time computation.
 *
 * No allocations beyond the result array. The result array is a
 * mutable `number[]` (cast to `readonly`) so callers can pass it to
 * `Object.freeze` if they want defensive immutability; we don't
 * freeze it here to keep the hot path allocation-free.
 */
export function structureMembership(
  catalogs: readonly CatalogWithSource[],
  centerMpc: Vec3,
  radiusMpc: number,
): StructureMembershipResult {
  const cx = centerMpc[0];
  const cy = centerMpc[1];
  const cz = centerMpc[2];
  // Compare against squared distance to avoid 2.5M Math.sqrt calls.
  const r2 = radiusMpc * radiusMpc;

  const packedIds: number[] = [];
  for (const { source, catalog } of catalogs) {
    const { positions, count } = catalog;
    // We could inline `(source << 26) | i` here to skip the
    // packSelection call on each member, but the call only fires for
    // galaxies INSIDE the sphere (typically a few hundred per cluster
    // out of millions scanned), so the call overhead is in the noise
    // compared to the inner-loop subtract/dot. Calling packSelection
    // keeps the encoding centralised — if the (shift, mask, offset)
    // layout ever changes, this hot loop doesn't need a parallel update.
    for (let i = 0; i < count; i++) {
      const base = i * 3;
      const dx = positions[base + 0]! - cx;
      const dy = positions[base + 1]! - cy;
      const dz = positions[base + 2]! - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r2) {
        packedIds.push(packSelection(source, i));
      }
    }
  }
  return { count: packedIds.length, packedIds };
}
