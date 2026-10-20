/**
 * diskPlannerWalk — the ONE per-frame catalog walk shared by the two
 * disk-planner bodies (LOD-1 procedural, LOD-2 textured): each surviving row's
 * geometry (camDistSq, sqrt, apparent px) is computed once and handed as scalars
 * to two injected DiskRowVisitor bodies.
 *
 * A stateful factory because it owns the SINGLE shared stride cursors (per
 * source, per resident block, keyed by ordinal base): both bodies decimate
 * against one cursor, so their sticky maps stay in phase.
 *
 * onRow is called at two SEPARATE statements, never a loop over the visitors: a
 * loop would be megamorphic across their hidden classes. No per-row object is
 * allocated anywhere in the loop.
 *
 * The distance early-out uses the looser bound, PROCEDURAL_DISK_FADE_START_PX
 * (8 px), so it never skips a row EITHER body could use. Apparent-size gating
 * stays in each body's `onRow` (procedural drops px <= 8, textured applies its
 * 24-px gate, famous rows exempt); gating here would braid body policy into the
 * shared loop.
 */

import { strideWindow } from '../../../utils/render/disk/strideWindow';
import { maxVisibleCamDistSq } from '../../../utils/render/disk/maxVisibleCamDistSq';
import { apparentSizePxAtDistance } from '../../../utils/render/disk/apparentSizePxAtDistance';
import { PROCEDURAL_DISK_FADE_START_PX } from '../../../data/galaxyLodBands';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { DiskPlannerWalk } from '../../../@types/engine/subsystems/DiskPlannerWalk';
import type { DiskRowVisitor } from '../../../@types/engine/subsystems/DiskRowVisitor';
import type { DiskWalkInput } from '../../../@types/engine/subsystems/DiskWalkInput';
import type { SourceType } from '../../../@types/data/SourceType';
import type { DiskPlannerWalkDeps } from '../../../@types/engine/subsystems/DiskPlannerWalkDeps';

/**
 * Per-frame cap on rows past the 8-px bound handed to the two onRow bodies
 * (a smaller row costs each body one compare). The distance gate's radius
 * grows with pxPerRad (∝ 1/tan(fovY/2)), which the FOV slider can push
 * arbitrarily high at narrow FOV — without a cap, a whole decimated window
 * clears the gate at once and floods colour lookup, RA/Dec conversion, and
 * the atlas's O(slotCount) LRU scan (~500× the 60° frame cost, measured).
 * 2048 = decimationFactor(8) × the galaxy atlas's slot count (256,
 * galaxyAtlasSubsystem.ts) — a full stride cycle's worth of atlas capacity,
 * well above the ~60 rows a 60° FOV admits in practice. Smaller rows are not
 * counted: GLADE alone puts thousands of them inside the gate sphere.
 */
export const DISK_ROW_ACCEPT_BUDGET = 2048;

export function createDiskPlannerWalk(deps: DiskPlannerWalkDeps = {}): DiskPlannerWalk {
  const decimationFactor = Math.max(1, Math.floor(deps.decimationFactor ?? 8));

  // The shared stride cursors: which row each block's decimated window resumes
  // from next frame, by source then ordinal base, with the block's row count so
  // an evicted block's ordinals can be purged. One map for BOTH bodies.
  const strideStartBySource = new Map<SourceType, Map<number, { next: number; count: number }>>();
  // This source's blocks walked this frame: a chunked source's evicted block
  // leaves a cursor (and sticky disks) behind that only this prune removes.
  const visited = new Set<number>();

  function runFrame(
    input: DiskWalkInput,
    procedural: DiskRowVisitor,
    textured: DiskRowVisitor,
  ): void {
    const { cam, records, sourceMask, pxPerRad } = input;

    // Looser (8-px) bound — see module header. Rows past it can't matter to
    // either body at any plausible galaxy diameter.
    const maxCamDistSqUpper = maxVisibleCamDistSq(PROCEDURAL_DISK_FADE_START_PX, pxPerRad);

    const cx = cam.position[0];
    const cy = cam.position[1];
    const cz = cam.position[2];

    // Rows admitted this frame across ALL sources — see DISK_ROW_ACCEPT_BUDGET.
    // Once spent, later blocks are left untouched (endSource still runs) and
    // resume where they stood on a later frame.
    let acceptedThisFrame = 0;

    for (const [source, record] of records) {
      if (((sourceMask >> source) & 1) === 0) {
        procedural.onSourceHidden(source);
        textured.onSourceHidden(source);
        continue;
      }

      const cursors =
        strideStartBySource.get(source) ?? new Map<number, { next: number; count: number }>();
      strideStartBySource.set(source, cursors);

      visited.clear();
      record.forEachResidentBlock((block, ordinalBase) => {
        visited.add(ordinalBase);
        // Spent: the block keeps its window and its sticky disks for a later frame. Advancing it
        // would starve one window every cycle whenever earlier blocks spend the budget in phase.
        if (acceptedThisFrame >= DISK_ROW_ACCEPT_BUDGET) return;
        const positions = block.positions;
        let cursor = cursors.get(ordinalBase);
        // A block's first pass walks all of it, so a landed chunk's disks show on its first frame.
        const firstPass = cursor === undefined;
        if (cursor === undefined) {
          cursor = { next: 0, count: block.count };
          cursors.set(ordinalBase, cursor);
        }
        const { safeStart, end, nextStart } = strideWindow(
          block.count,
          firstPass ? 1 : decimationFactor,
          cursor.next,
        );

        procedural.beginBlock(source, ordinalBase + safeStart, ordinalBase + end, ordinalBase);
        textured.beginBlock(source, ordinalBase + safeStart, ordinalBase + end, ordinalBase);

        let next = nextStart;
        for (let i = safeStart; i < end; i++) {
          const i3 = i * 3;
          const x = positions[i3 + 0]!;
          const y = positions[i3 + 1]!;
          const z = positions[i3 + 2]!;

          const dx = cx - x;
          const dy = cy - y;
          const dz = cz - z;
          const camDistSq = dx * dx + dy * dy + dz * dz;
          // Negated so a NaN position (a blob, not a galaxy) fails too.
          if (!(camDistSq > 0 && camDistSq <= maxCamDistSqUpper)) continue;

          const camDist = Math.sqrt(camDistSq);
          const px = apparentSizePxAtDistance(block.diameterKpc[i]!, camDist, pxPerRad);

          procedural.onRow(source, block, i, x, y, z, camDist, px);
          textured.onRow(source, block, i, x, y, z, camDist, px);

          if (px <= PROCEDURAL_DISK_FADE_START_PX) continue;
          acceptedThisFrame++;
          if (acceptedThisFrame >= DISK_ROW_ACCEPT_BUDGET) {
            // The window's rest (purged above) is walked from here next frame.
            next = i + 1 < block.count ? i + 1 : 0;
            break;
          }
        }

        cursor.next = next;
      });
      if (cursors.size > visited.size) {
        for (const [base, { count }] of cursors) {
          if (visited.has(base)) continue;
          cursors.delete(base);
          // A window over the whole evicted block with no rows: each body purges its sticky disks there.
          procedural.beginBlock(source, base, base + count, base);
          textured.beginBlock(source, base, base + count, base);
        }
      }

      procedural.endSource(source);
      textured.endSource(source);
    }

    procedural.endFrame();
    textured.endFrame();
  }

  function destroy(): void {
    strideStartBySource.clear();
  }

  const walk: DiskPlannerWalk = { runFrame, destroy };
  walk satisfies Destroyable;
  return walk;
}
