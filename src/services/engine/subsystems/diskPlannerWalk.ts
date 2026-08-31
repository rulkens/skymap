/**
 * diskPlannerWalk — the ONE per-frame catalog walk shared by the two
 * disk-planner bodies (LOD-1 procedural, LOD-2 textured).
 *
 * Each planner used to walk every visible catalog itself: read the row's
 * position, compute camDistSq, take a sqrt, compute apparent px — the same
 * geometry twice per row, and the dominant share of frame CPU. This walk
 * computes each surviving row's geometry ONCE and hands the scalars to two
 * injected DiskRowVisitor bodies.
 *
 * ### Why a stateful factory, not a pure utils/ helper
 *
 * The walk owns the SINGLE shared per-source stride cursor — genuine
 * cross-frame state with exactly one home. A factory closes over it; a pure
 * helper would force the cursor map to be threaded through the frame call
 * site. Both bodies decimating against one cursor also means they always see
 * the identical stride window, so their sticky maps stay in phase.
 *
 * ### Why two fixed call sites, not a visitor array
 *
 * onRow is called at two SEPARATE statements — 'procedural.onRow(...)' then
 * 'textured.onRow(...)' — never a loop over [procedural, textured]. A looped
 * call site would be megamorphic across the two visitors' hidden classes;
 * two fixed sites each stay monomorphic. onRow takes scalar args plus the
 * catalog reference: no per-row object is allocated anywhere in the loop.
 *
 * ### Why the early-out uses the 8-px bound and no px gate
 *
 * The distance early-out must not skip a row EITHER body could use, so it
 * uses the looser bound: PROCEDURAL_DISK_FADE_START_PX (8 px). Apparent-size
 * gating is each body's own business — the procedural body drops px <= 8
 * inside onRow, the textured body applies its 24-px gate (famous rows
 * exempt). Gating here would re-braid body policy into the shared loop.
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

export type DiskPlannerWalkDeps = {
  /** Defaults to 8.  Tests pass 1 to disable decimation. */
  readonly decimationFactor?: number;
};

/**
 * Per-frame cap on rows admitted into the two onRow bodies. The distance
 * gate's radius grows with pxPerRad (∝ 1/tan(fovY/2)), which the FOV slider
 * can push arbitrarily high at narrow FOV — without a cap, a whole decimated
 * window clears the gate at once and floods colour lookup, RA/Dec
 * conversion, and the atlas's O(slotCount) LRU scan (~500× the 60° frame
 * cost, measured). 2048 = decimationFactor(8) × the galaxy atlas's slot
 * count (256, galaxyAtlasSubsystem.ts) — a full stride cycle's worth of
 * atlas capacity, well above the ~60 rows a 60° FOV admits in practice.
 */
export const DISK_ROW_ACCEPT_BUDGET = 2048;

export function createDiskPlannerWalk(deps: DiskPlannerWalkDeps = {}): DiskPlannerWalk {
  const decimationFactor = Math.max(1, Math.floor(deps.decimationFactor ?? 8));

  // The single shared stride cursor: which row each source's decimated
  // window resumes from next frame. One map for BOTH bodies.
  const strideStartBySource = new Map<SourceType, number>();

  function runFrame(
    input: DiskWalkInput,
    procedural: DiskRowVisitor,
    textured: DiskRowVisitor,
  ): void {
    const { cam, catalogs, visibleSourceMask, pxPerRad } = input;

    // Looser (8-px) bound — see module header. Rows past it can't matter to
    // either body at any plausible galaxy diameter.
    const maxCamDistSqUpper = maxVisibleCamDistSq(PROCEDURAL_DISK_FADE_START_PX, pxPerRad);

    const cx = cam.position[0];
    const cy = cam.position[1];
    const cz = cam.position[2];

    // Rows admitted this frame across ALL sources — see DISK_ROW_ACCEPT_BUDGET.
    // Once spent, later sources skip their row loop (beginSource/endSource
    // still run, so purge + cursor stay correct) and are swept on a later,
    // rotated window.
    let acceptedThisFrame = 0;

    for (const [source, catalog] of catalogs.entries()) {
      if (((visibleSourceMask >> source) & 1) === 0) {
        procedural.onSourceHidden(source);
        textured.onSourceHidden(source);
        continue;
      }

      const positions = catalog.positions;
      const count = catalog.count;
      const { safeStart, end, nextStart } = strideWindow(
        count,
        decimationFactor,
        strideStartBySource.get(source) ?? 0,
      );

      procedural.beginSource(source, safeStart, end);
      textured.beginSource(source, safeStart, end);

      if (acceptedThisFrame < DISK_ROW_ACCEPT_BUDGET) {
        for (let i = safeStart; i < end; i++) {
          const i3 = i * 3;
          const x = positions[i3 + 0]!;
          const y = positions[i3 + 1]!;
          const z = positions[i3 + 2]!;

          const dx = cx - x;
          const dy = cy - y;
          const dz = cz - z;
          const camDistSq = dx * dx + dy * dy + dz * dz;
          if (camDistSq <= 0 || camDistSq > maxCamDistSqUpper) continue;

          const camDist = Math.sqrt(camDistSq);
          const px = apparentSizePxAtDistance(catalog.diameterKpc[i]!, camDist, pxPerRad);

          procedural.onRow(source, catalog, i, x, y, z, camDist, px);
          textured.onRow(source, catalog, i, x, y, z, camDist, px);

          acceptedThisFrame++;
          if (acceptedThisFrame >= DISK_ROW_ACCEPT_BUDGET) break;
        }
      }

      strideStartBySource.set(source, nextStart);

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
