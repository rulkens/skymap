/**
 * texturedDiskSubsystem — LOD-2 per-frame planner.
 *
 * Walks the catalogs, applies the px ≥ 24 gate, allocates atlas slots,
 * schedules fetches, computes load-fade × distance-fade, sorts back-to-front,
 * and emits the sorted disk array. Shares the per-row helpers in
 * `utils/render/disk/` with the LOD-1 procedural planner.
 *
 * Disks-only (no screen-aligned quad fallback): every encoded galaxy has finite
 * orientation via the build-pipeline fallback, so the `Number.isFinite` checks
 * below are only a corrupted-`.bin` guard.
 *
 * Ownership split with `galaxyAtlasSubsystem`: the atlas owns "did a bitmap land
 * / permanently fail?" (persistent across frames); this planner owns "when did
 * it land / is the load-fade still ramping?" (per-frame planning state).
 */

import { Source } from '../../../data/sources';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { DiskInstance } from '../../../@types/rendering/DiskInstance';
import type { GalaxyAtlasSubsystem } from '../../../@types/engine/subsystems/GalaxyAtlasSubsystem';
import type { HiResFamousSubsystem } from '../../../@types/engine/subsystems/HiResFamousSubsystem';
import type { SourceType } from '../../../@types/data/SourceType';
import type {
  TexturedDiskFrameInput,
  TexturedDiskFrameOutput,
  TexturedDiskSubsystemWithTestSeam,
} from '../../../@types/engine/subsystems/TexturedDiskSubsystem';
import { fetchGalaxyBitmap } from '../../../utils/network/fetchGalaxyBitmap';
import { cartesianToRaDec, smoothstep } from '../../../utils/math';
import { apparentSizePxAtDistance } from '../../../utils/render/disk/apparentSizePxAtDistance';
import { maxVisibleCamDistSq } from '../../../utils/render/disk/maxVisibleCamDistSq';
import { diskQuadExtentMpc } from '../../../utils/render/disk/diskQuadExtentMpc';
import { loadFadeAlpha } from '../../../utils/render/disk/loadFadeAlpha';
import { strideWindow } from '../../../utils/render/disk/strideWindow';
import { purgeStrideWindow } from '../../../utils/render/disk/purgeStrideWindow';
import { byDistanceToCamera } from '../../../utils/render/disk/byDistanceToCamera';
import { galaxyCacheKey } from '../../../utils/render/disk/galaxyCacheKey';
import { resolveDiskPlacement } from '../../../utils/render/disk/resolveDiskPlacement';
import { hiResLayerFold } from '../../../utils/render/disk/hiResLayerFold';
import {
  APPARENT_SIZE_THRESHOLD_PX,
  FADE_BAND_PX,
  DISK_THRESHOLD_PX,
} from '../../../data/galaxyLodBands';

/** Load-fade duration once a bitmap lands (ms). */
const LOAD_FADE_MS = 400;

export type TexturedDiskDeps = {
  readonly device: GPUDevice;
  readonly atlas: GalaxyAtlasSubsystem;
  /** For tests.  Defaults to fetchGalaxyBitmap. */
  readonly fetcher?: (args: {
    ra: number;
    dec: number;
    famousId?: string;
  }) => Promise<ImageBitmap | null>;
  readonly decimationFactor?: number;
  /**
   * Optional LOD-3 source. When provided, the planner folds each famous
   * galaxy's `hiResLayerIdx` + `hiResCrossfadeAlpha` into its `DiskInstance`;
   * when omitted, every instance gets the -1 / 0 sentinel and the shader's
   * `hiResLayerIdx >= 0` gate skips the hi-res sample.
   */
  readonly hiResFamous?: HiResFamousSubsystem;
};

export function createTexturedDiskSubsystem(
  deps: TexturedDiskDeps,
): TexturedDiskSubsystemWithTestSeam {
  // No requestRender dep: the planner runs inside frames, and async bitmap
  // arrivals wake the loop via the atlas subsystem's onResult.
  const { atlas } = deps;
  const fetcher = deps.fetcher ?? fetchGalaxyBitmap;
  const decimationFactor = Math.max(1, Math.floor(deps.decimationFactor ?? 8));
  // Mutable binding rather than `const` so `setHiResFamous(...)` can
  // swap the planner reference on tier change without rebuilding the
  // whole subsystem (which would discard per-key load-fade timestamps
  // for unrelated SDSS / 2MRS / GLADE galaxies).  See the
  // `setHiResFamous` docstring on `TexturedDiskSubsystem`.
  let hiResFamous = deps.hiResFamous;

  // Load-fade timing — separate from the atlas's `bitmapReady`/`bitmapFailed`
  // set membership.  Cleared via the atlas's eviction handler so we don't
  // leak entries for recycled slots.
  const bitmapReadyTime = new Map<string, number>();

  atlas.setEvictHandler((key) => {
    bitmapReadyTime.delete(key);
  });

  const stickyDisksBySource = new Map<SourceType, Map<number, DiskInstance>>();
  const strideStartBySource = new Map<SourceType, number>();

  let frameCounter = 0;
  let destroyed = false;

  // The last frame's stamped clock, held so code that runs OUTSIDE a frame
  // (the async bitmap-arrival callback, hasInFlightWork) reads the frame
  // clock instead of sampling performance.now(). At most one frame stale —
  // irrelevant to a 400 ms load-fade — and deterministic under a stepped
  // recorder clock.
  let lastFrameNowMs = 0;

  let lastOutput: TexturedDiskFrameOutput = { disks: [] };

  function runFrame(input: TexturedDiskFrameInput): TexturedDiskFrameOutput {
    if (destroyed) return lastOutput;

    const { cam, catalogs, visibleSourceMask, pxPerRad, famousMeta, nowMs } = input;
    frameCounter++;
    lastFrameNowMs = nowMs;

    const maxCamDistSqUpper = maxVisibleCamDistSq(APPARENT_SIZE_THRESHOLD_PX, pxPerRad);

    const cx = cam.position[0];
    const cy = cam.position[1];
    const cz = cam.position[2];

    const disks: DiskInstance[] = [];

    for (const [source, catalog] of catalogs.entries()) {
      let stickyDisks = stickyDisksBySource.get(source);
      if (!stickyDisks) {
        stickyDisks = new Map();
        stickyDisksBySource.set(source, stickyDisks);
      }

      if (((visibleSourceMask >> source) & 1) === 0) {
        stickyDisks.clear();
        continue;
      }

      const positions = catalog.positions;
      const count = catalog.count;
      const { safeStart, end, nextStart } = strideWindow(
        count,
        decimationFactor,
        strideStartBySource.get(source) ?? 0,
      );
      purgeStrideWindow(stickyDisks, safeStart, end);

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

        const dKpcRow = catalog.diameterKpc[i]!;
        const camDist = Math.sqrt(camDistSq);
        const px = apparentSizePxAtDistance(dKpcRow, camDist, pxPerRad);

        if (source !== Source.FamousGalaxy && px < APPARENT_SIZE_THRESHOLD_PX) continue;

        const sizeWorldMpc = diskQuadExtentMpc(dKpcRow);
        const ar = catalog.axisRatio[i]!;
        const pa = catalog.positionAngleDeg[i]!;

        // Famous-galaxy thumbnails carry a hand-authored calibration that
        // overrides catalog geometry for the EMITTED instance (size, tilt,
        // nucleus offset); `resolveDiskPlacement` folds in the no-calibration
        // default so the catalog `ar`/`pa` stay untouched for the
        // finite-orientation guard below (the corrupted-bin guard, not the
        // render values).  An absent calibration leaves the placement
        // bit-identical to the catalog path.
        const cal = source === Source.FamousGalaxy ? famousMeta[i]?.calibration : undefined;
        const placement = resolveDiskPlacement(sizeWorldMpc, ar, pa, cal);

        const [ra, dec] = cartesianToRaDec(x, y, z);
        const key = galaxyCacheKey(ra, dec);

        const slot = atlas.allocate(key, frameCounter);
        if (slot === null) continue;

        if (atlas.isFailed(key)) continue;

        if (!atlas.isLoaded(key)) {
          const sourceForFetch = source;
          const idxForFetch = i;
          atlas.enqueueFetch({
            key,
            priority: px,
            fetcher: () => {
              const fId =
                sourceForFetch === Source.FamousGalaxy ? famousMeta[idxForFetch]?.id : undefined;
              return fetcher({ ra, dec, famousId: fId });
            },
            onResult: (bitmap) => {
              if (destroyed) {
                bitmap?.close();
                return;
              }
              if (!bitmap) return; // atlas already memoised the failure
              if (atlas.lastSeenFrame(key) === undefined) {
                bitmap.close();
                return;
              }
              atlas.uploadBitmap(slot, bitmap);
              // Arrival stamps quantize to the frame clock so crossfade
              // alphas are a pure function of stamped time (deterministic
              // under a stepped recorder clock); sub-frame precision is
              // irrelevant to a 300 ms crossfade.
              bitmapReadyTime.set(key, lastFrameNowMs);
              bitmap.close();
            },
          });
          continue;
        }

        const [u0, v0, u1, v1] = atlas.slotUv(slot);

        const distFade = smoothstep(
          APPARENT_SIZE_THRESHOLD_PX,
          APPARENT_SIZE_THRESHOLD_PX + FADE_BAND_PX,
          px,
        );
        const loadFade = loadFadeAlpha(bitmapReadyTime.get(key), nowMs, LOAD_FADE_MS);
        const fadeAlpha = distFade * loadFade;

        // Disks-only.  The `Number.isFinite` checks are a defensive
        // guard against corrupted .bin files — every encoded galaxy
        // has finite orientation via the build-pipeline fallback.
        if (px > DISK_THRESHOLD_PX && Number.isFinite(ar) && Number.isFinite(pa)) {
          // Hi-res LOD-3 fold-in: only Famous-source rows can be assigned a
          // hi-res layer (the curated WebP atlas covers Famous galaxies only),
          // so non-Famous sources pass `undefined` and fold the -1 / 0 sentinel
          // the shader's `hiResLayerIdx >= 0` gate skips.  `i` is the per-catalog
          // local index, which for `Source.FamousGalaxy` matches the
          // Famous-source-local key contract on `byFamousIdx`.
          const hiRes = hiResLayerFold(
            source === Source.FamousGalaxy ? hiResFamous?.lastOutput.byFamousIdx : undefined,
            i,
          );
          stickyDisks.set(i, {
            x,
            y,
            z,
            sizeWorld: placement.sizeWorld,
            u0,
            v0,
            u1,
            v1,
            axisRatio: placement.axisRatio,
            positionAngleDeg: placement.positionAngleDeg,
            fadeAlpha,
            hiResLayerIdx: hiRes.hiResLayerIdx,
            hiResCrossfadeAlpha: hiRes.hiResCrossfadeAlpha,
            nucleusOffset: placement.nucleusOffset,
          });
        }
      }

      strideStartBySource.set(source, nextStart);

      for (const d of stickyDisks.values()) disks.push(d);
    }

    disks.sort(byDistanceToCamera(cam.position));

    lastOutput = { disks };
    return lastOutput;
  }

  function hasInFlightWork(): boolean {
    if (atlas.inFlightCount() > 0) return true;
    if (bitmapReadyTime.size === 0) return false;
    // Read at the last frame's stamped clock: this predicate is consumed by
    // the same frame loop that stamps it, so "one frame stale" just extends
    // a 400 ms fade window by one frame — a no-op visually, and it keeps
    // the loop-alive decision deterministic under a stepped recorder clock.
    for (const t of bitmapReadyTime.values()) {
      if (lastFrameNowMs - t < LOAD_FADE_MS) return true;
    }
    return false;
  }

  function destroy(): void {
    destroyed = true;
    atlas.setEvictHandler(undefined);
    bitmapReadyTime.clear();
    stickyDisksBySource.clear();
    strideStartBySource.clear();
    lastOutput = { disks: [] };
  }

  function setHiResFamous(next: HiResFamousSubsystem | undefined): void {
    hiResFamous = next;
  }

  const subsystem: TexturedDiskSubsystemWithTestSeam = {
    runFrame,
    get lastOutput() {
      return lastOutput;
    },
    hasInFlightWork,
    setHiResFamous,
    destroy,
    __testGetState() {
      return { bitmapReadyTime };
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
