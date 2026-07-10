/**
 * DiskRowVisitor — the row-reducer view a disk planner exposes so the shared
 * walk can drive it without owning its per-body state.
 *
 * ### Why a visitor, not a return-an-array step
 *
 * A disk planner used to be a `runFrame(input): Output` that walked the
 * catalogs itself. Folding the two planners into one shared walk means the
 * walk owns the loop, so each planner has to surrender its loop body while
 * keeping its own sticky map, output accumulator, sort, and per-body extras.
 * The visitor is that surrendered body: the walk calls the lifecycle hooks in
 * a fixed order (`beginSource` → `onRow`* → `endSource` per source, then one
 * `endFrame`), and the visitor closes over the state the walk must not know
 * about.
 *
 * ### Why scalar `onRow` args
 *
 * `onRow` takes the row geometry as loose scalars plus the catalog reference —
 * never a per-row object — because it is the innermost hot call (~300k
 * invocations/frame across both bodies) and must not allocate. The walk calls
 * `procedural.onRow(...)` and `textured.onRow(...)` at two fixed, separate
 * statements so each stays monomorphic (a loop over a visitor array would make
 * the call site megamorphic across the two hidden classes).
 */

import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { SourceType } from '../../data/SourceType';

export type DiskRowVisitor = {
  /** Source bit is clear this frame → clear this body's sticky map for it. */
  onSourceHidden(source: SourceType): void;
  /** Before the row loop → purgeStrideWindow(stickyMap, safeStart, end). */
  beginSource(source: SourceType, safeStart: number, end: number): void;
  /** One surviving row; geometry (camDist, px) already computed by the walk. */
  onRow(
    source: SourceType,
    catalog: GalaxyCatalog,
    i: number,
    x: number,
    y: number,
    z: number,
    camDist: number,
    px: number,
  ): void;
  /** After the row loop → push this body's sticky values into its output accumulator. */
  endSource(source: SourceType): void;
  /** After all sources → sort back-to-front, stash on the subsystem's lastOutput. */
  endFrame(): void;
};
