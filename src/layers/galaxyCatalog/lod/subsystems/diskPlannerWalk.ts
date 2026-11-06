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
 * (8 px), so it never skips a row EITHER body could use; a row outside every
 * view is skipped too. Apparent-size gating
 * stays in each body's `onRow` (procedural drops px <= 8, textured applies its
 * 24-px gate, famous rows exempt); gating here would braid body policy into the
 * shared loop.
 */

import { galaxyCatalogIdOf } from '../../../../utils/galaxyCatalogIdOf';
import { strideWindow } from '../utils/strideWindow';
import { maxVisibleCamDistSq } from '../utils/maxVisibleCamDistSq';
import { apparentSizePxAtDistance } from '../utils/apparentSizePxAtDistance';
import { PROCEDURAL_DISK_FADE_START_PX } from '../data/galaxyLodBands';
import { DISK_WALK_DECIMATION } from '../data/diskWalkDecimation';
import { sphereInAnyFrustum } from '../../../../utils/camera/frustum/sphereInAnyFrustum';
import { diskQuadExtentMpc } from '../utils/diskQuadExtentMpc';
import type { Destroyable } from '../../../../@types/rendering/Destroyable';
import type { DiskPlannerWalk } from '../@types/DiskPlannerWalk';
import type { DiskRowVisitor } from '../@types/DiskRowVisitor';
import type { DiskWalkInput } from '../@types/DiskWalkInput';
import type { GalaxyCatalogSourceType } from '../../@types/GalaxyCatalogSourceType';
import type { DiskPlannerWalkDeps } from '../@types/DiskPlannerWalkDeps';

/**
 * Per-frame cap on rows admitted into the two onRow bodies. The distance
 * gate's radius grows with pxPerRad (∝ 1/tan(fovY/2)); the view cull keeps a
 * narrow FOV to its own cone, but a dense cone can still flood colour lookup,
 * RA/Dec conversion, and the atlas's O(slotCount) LRU scan. 2048 =
 * decimationFactor(8) × the galaxy atlas's slot count (256,
 * galaxyAtlasSubsystem.ts) — a full stride cycle's worth of atlas capacity.
 */
export const DISK_ROW_ACCEPT_BUDGET = 2048;

// Cull sphere per quad extent: the quad's corner reaches √2 of its half-extent,
// and a famous thumbnail's calibration can widen the quad past the catalog size.
const VIEW_CULL_RADIUS_PER_EXTENT = 2;

export function createDiskPlannerWalk(deps: DiskPlannerWalkDeps = {}): DiskPlannerWalk {
  const decimationFactor = Math.max(1, Math.floor(deps.decimationFactor ?? DISK_WALK_DECIMATION));

  // The shared stride cursors: which row each block's decimated window resumes
  // from next frame, by source then ordinal base. One map for BOTH bodies.
  const strideStartBySource = new Map<GalaxyCatalogSourceType, Map<number, number>>();

  function runFrame(
    input: DiskWalkInput,
    procedural: DiskRowVisitor,
    textured: DiskRowVisitor,
  ): void {
    const { cam, records, visibleCatalogs, pxPerRad, viewPlanes } = input;

    // Looser (8-px) bound — see module header. Rows past it can't matter to
    // either body at any plausible galaxy diameter.
    const maxCamDistSqUpper = maxVisibleCamDistSq(PROCEDURAL_DISK_FADE_START_PX, pxPerRad);

    const cx = cam.position[0];
    const cy = cam.position[1];
    const cz = cam.position[2];

    // Rows admitted this frame across ALL sources — see DISK_ROW_ACCEPT_BUDGET.
    // Once spent, later sources skip their row loop (beginBlock/endSource
    // still run, so purge + cursor stay correct) and are swept on a later,
    // rotated window.
    let acceptedThisFrame = 0;

    for (const [source, record] of records) {
      if (!visibleCatalogs.has(galaxyCatalogIdOf(source))) {
        procedural.onSourceHidden(source);
        textured.onSourceHidden(source);
        continue;
      }

      const cursors = strideStartBySource.get(source) ?? new Map<number, number>();
      strideStartBySource.set(source, cursors);

      record.forEachResidentBlock((block, ordinalBase) => {
        const positions = block.positions;
        const { safeStart, end, nextStart } = strideWindow(
          block.count,
          decimationFactor,
          cursors.get(ordinalBase) ?? 0,
        );

        procedural.beginBlock(source, ordinalBase + safeStart, ordinalBase + end, ordinalBase);
        textured.beginBlock(source, ordinalBase + safeStart, ordinalBase + end, ordinalBase);

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
            const diameterKpc = block.diameterKpc[i]!;
            const cullRadius = diskQuadExtentMpc(diameterKpc) * VIEW_CULL_RADIUS_PER_EXTENT;
            if (!sphereInAnyFrustum(viewPlanes, -dx, -dy, -dz, cullRadius)) continue;

            const camDist = Math.sqrt(camDistSq);
            const px = apparentSizePxAtDistance(diameterKpc, camDist, pxPerRad);

            procedural.onRow(source, block, i, x, y, z, camDist, px);
            textured.onRow(source, block, i, x, y, z, camDist, px);

            acceptedThisFrame++;
            if (acceptedThisFrame >= DISK_ROW_ACCEPT_BUDGET) break;
          }
        }

        cursors.set(ordinalBase, nextStart);
      });

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
