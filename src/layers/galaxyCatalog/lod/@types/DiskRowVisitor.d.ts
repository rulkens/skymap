/**
 * DiskRowVisitor — the row-reducer view a disk planner exposes so the shared
 * walk can drive it without owning its per-body state (sticky map, output
 * accumulator, sort, extras).
 *
 * Hook order: per source, `beginBlock` then `onRow`* once per resident block,
 * then one `endSource`; then one `endFrame`. Sticky maps key by record ordinal,
 * which survives a block's eviction where a block-local row index would not.
 *
 * `onRow` takes loose scalars, never a per-row object: it is the innermost hot
 * call (~300k/frame) and must not allocate. The walk calls the two visitors at
 * two separate statements so each call site stays monomorphic.
 */

import type { GalaxyColumnBlock } from '../../records/@types/GalaxyColumnBlock';
import type { GalaxyCatalogSourceType } from '../../@types/GalaxyCatalogSourceType';

export type DiskRowVisitor = {
  /** Source bit is clear this frame, or every view is occluded → clear this body's sticky map for it. */
  onSourceHidden(source: GalaxyCatalogSourceType): void;
  /**
   * Before a block's row loop → purgeStrideWindow(stickyMap, windowStart, windowEnd),
   * both ordinals; a row's ordinal is `ordinalBase + i`.
   */
  beginBlock(
    source: GalaxyCatalogSourceType,
    windowStart: number,
    windowEnd: number,
    ordinalBase: number,
  ): void;
  /** One surviving row `i` of `block`; geometry (camDist, px) already computed by the walk. */
  onRow(
    source: GalaxyCatalogSourceType,
    block: GalaxyColumnBlock,
    i: number,
    x: number,
    y: number,
    z: number,
    camDist: number,
    px: number,
  ): void;
  /** After the source's last block → push this body's sticky values into its output accumulator. */
  endSource(source: GalaxyCatalogSourceType): void;
  /** After all sources → sort back-to-front, stash on the subsystem's lastOutput. */
  endFrame(): void;
};
