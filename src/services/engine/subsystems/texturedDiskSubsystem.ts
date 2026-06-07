/**
 * texturedDiskSubsystem — LOD-2 per-frame planner.
 *
 * Walks the catalog, applies the px ≥ 24 gate, allocates atlas slots
 * via the injected atlas subsystem, schedules fetches, computes
 * load-fade + distance-fade, sorts back-to-front, emits the sorted
 * disk array.
 *
 * ### Why disks-only (no screen-aligned quad fallback)
 *
 * Every encoded galaxy has finite orientation — `tools/catalog/buildAllBins.ts`
 * applies a deterministic hash-based fallback when the parser emits
 * null — so a quad-fallback branch would only fire for famous galaxies
 * at <4 px apparent size, where the point sprite is already at full
 * strength.  The `Number.isFinite` checks below stay as a defensive
 * guard against corrupted .bin files.
 *
 * ### What this owns (vs. galaxyAtlasSubsystem)
 *
 * The atlas subsystem owns "did a bitmap land at all? did the fetch
 * permanently fail?".  This subsystem owns "when did the bitmap land?
 * is the load-fade still ramping?".  The split mirrors the difference
 * between persistent atlas state (lives across frames) and per-frame
 * planning state (lives in the planner that uses it).
 */

import { Source } from '../../../data/sources';
import { paddedRadiusMpc } from '../../../utils/galaxySize';
import type { GalaxyCatalog } from '../../../@types/data/GalaxyCatalog';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
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
import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import { fetchGalaxyBitmap } from '../../../utils/network/galaxyImageFetcher';
import { cartesianToRaDec } from '../../../utils/math';
import { calibratedDiskSizeWorld, effectiveTilt, nucleusCorner } from './famousPlacement';
import type { Vec2 } from '../../../@types/math/Vec2';

/**
 * Apparent-size gate (px).  Exported so the procedural-disk subsystem
 * can compute its fade-OUT against the textured-disk fade-IN band in
 * lockstep (the famous-WebP crossfade); see `proceduralDiskSubsystem.ts`.
 */
export const APPARENT_SIZE_THRESHOLD_PX = 24;
/**
 * Width of the procedural → textured disk crossfade band (px).  16 px
 * gives the eye time to register the handoff between the procedural
 * pattern and the curated WebP at typical fly-in speeds; narrower
 * bands flash by in a fraction of a second.
 */
export const FADE_BAND_PX = 16;
/** Load-fade duration once a bitmap lands (ms). */
const LOAD_FADE_MS = 400;
/** Squared-distance early-out bound based on max plausible galaxy diameter. */
const MAX_PLAUSIBLE_DIAMETER_KPC = 200;
/** Disks render above this apparent size; below it the point sprite carries. */
const DISK_THRESHOLD_PX = 4;

/** Cache key for atlas + load-fade maps — RA/Dec rounded to 5 dp. */
export function galaxyCacheKey(ra: number, dec: number): string {
  return `${ra.toFixed(5)}_${dec.toFixed(5)}`;
}

export type TexturedDiskDeps = {
  readonly device: GPUDevice;
  readonly atlas: GalaxyAtlasSubsystem;
  readonly requestRender: () => void;
  /** For tests.  Defaults to fetchGalaxyBitmap. */
  readonly fetcher?: (args: {
    ra: number;
    dec: number;
    famousId?: string;
  }) => Promise<ImageBitmap | null>;
  readonly decimationFactor?: number;
  /**
   * Optional. When provided, the planner reads hi-res state per
   * Famous-source galaxy (keyed by per-cloud local index) and folds
   * `hiResLayerIdx` + `hiResCrossfadeAlpha` into the emitted
   * `DiskInstance`. When omitted, both default to -1 / 0 for every
   * instance — preserving pre-hi-res behaviour exactly. The shader
   * already gates the hi-res sample on `hiResLayerIdx >= 0`, so the
   * sentinel reliably disables the LOD-3 path with no extra branching.
   */
  readonly hiResFamous?: HiResFamousSubsystem;
};

export function createTexturedDiskSubsystem(
  deps: TexturedDiskDeps,
): TexturedDiskSubsystemWithTestSeam {
  const { atlas, requestRender } = deps;
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

  let lastOutput: TexturedDiskFrameOutput = { disks: [] };

  function runFrame(input: TexturedDiskFrameInput): TexturedDiskFrameOutput {
    if (destroyed) return lastOutput;

    const { cam, catalogs, visibleSourceMask, pxPerRad, famousMeta } = input;
    frameCounter++;

    const dMpcMax = MAX_PLAUSIBLE_DIAMETER_KPC / 1000;
    const maxCamDistForVisibilityUpper = (dMpcMax * pxPerRad) / APPARENT_SIZE_THRESHOLD_PX;
    const maxCamDistSqUpper = maxCamDistForVisibilityUpper * maxCamDistForVisibilityUpper;

    const cx = cam.position[0];
    const cy = cam.position[1];
    const cz = cam.position[2];

    const disks: DiskInstance[] = [];

    const nowMs = performance.now();

    for (const [cloudSource, cloud] of catalogs.entries()) {
      let stickyDisks = stickyDisksBySource.get(cloudSource);
      if (!stickyDisks) {
        stickyDisks = new Map();
        stickyDisksBySource.set(cloudSource, stickyDisks);
      }

      if (((visibleSourceMask >> cloudSource) & 1) === 0) {
        stickyDisks.clear();
        continue;
      }

      const positions = cloud.positions;
      const count = cloud.count;
      const stride = Math.max(1, Math.ceil(count / decimationFactor));
      const start = strideStartBySource.get(cloudSource) ?? 0;
      const safeStart = start >= count ? 0 : start;
      const end = Math.min(safeStart + stride, count);

      const purgeStride = <V>(m: Map<number, V>): void => {
        const drop: number[] = [];
        for (const k of m.keys()) {
          if (k >= safeStart && k < end) drop.push(k);
        }
        for (const k of drop) m.delete(k);
      };
      purgeStride(stickyDisks);

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

        const dKpcRow = cloud.diameterKpc[i]!;
        const dMpcRow = dKpcRow / 1000;
        const camDist = Math.sqrt(camDistSq);
        const px = (dMpcRow / camDist) * pxPerRad;

        if (cloudSource !== Source.FamousGalaxy && px < APPARENT_SIZE_THRESHOLD_PX) continue;

        // posSize.w stores the FULL quad extent (vertex stage halves it
        // at corner expansion), so double the shared radius helper.
        const sizeWorldMpc = paddedRadiusMpc(dKpcRow) * 2;
        const ar = cloud.axisRatio[i]!;
        const pa = cloud.positionAngleDeg[i]!;

        // Famous-galaxy thumbnails ship with a hand-authored placement
        // calibration that overrides catalog geometry for the EMITTED
        // instance (size, tilt, nucleus offset).  The catalog `ar`/`pa`
        // above stay untouched — the finite-orientation gate below reads
        // them as the corrupted-bin guard, not the render values.  An
        // absent calibration (the common case) leaves every emitted value
        // bit-identical to the catalog path.
        const cal = cloudSource === Source.FamousGalaxy ? famousMeta[i]?.calibration : undefined;
        let sizeForInstance = sizeWorldMpc;
        let axisRatioForInstance = ar;
        let paForInstance = pa;
        let nucleus: Vec2 = [0, 0];
        if (cal !== undefined) {
          sizeForInstance = calibratedDiskSizeWorld(sizeWorldMpc, cal.diskRadiusFrac);
          const tilt = effectiveTilt(cal, ar, pa);
          axisRatioForInstance = tilt.axisRatio;
          paForInstance = tilt.positionAngleDeg;
          nucleus = nucleusCorner(cal.center);
        }

        const [ra, dec] = cartesianToRaDec(x, y, z);
        const key = galaxyCacheKey(ra, dec);

        const slot = atlas.allocate(key, frameCounter);
        if (slot === null) continue;

        if (atlas.isFailed(key)) continue;

        if (!atlas.isLoaded(key)) {
          const sourceForFetch = cloudSource;
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
              bitmapReadyTime.set(key, performance.now());
              bitmap.close();
            },
          });
          continue;
        }

        const [u0, v0, u1, v1] = atlas.slotUv(slot);

        const distT = Math.min(1, Math.max(0, (px - APPARENT_SIZE_THRESHOLD_PX) / FADE_BAND_PX));
        const distFade = distT * distT * (3 - 2 * distT);
        const tReady = bitmapReadyTime.get(key);
        const loadFade = tReady === undefined ? 0 : Math.min(1, (nowMs - tReady) / LOAD_FADE_MS);
        const fadeAlpha = distFade * loadFade;

        // Disks-only.  The `Number.isFinite` checks are a defensive
        // guard against corrupted .bin files — every encoded galaxy
        // has finite orientation via the build-pipeline fallback.
        if (px > DISK_THRESHOLD_PX && Number.isFinite(ar) && Number.isFinite(pa)) {
          // Hi-res LOD-3 fold-in: only Famous-source rows can possibly
          // be assigned a hi-res layer (the curated WebP atlas covers
          // Famous galaxies only). Non-Famous sources emit the sentinel
          // -1 / 0 unconditionally — the shader's `hiResLayerIdx >= 0`
          // gate makes those rows skip the hi-res sample entirely.
          // `i` is the per-cloud local index, which for `Source.FamousGalaxy`
          // matches the Famous-source-local key contract on
          // `HiResFamousFrameOutput.byFamousIdx` (a numeric map).
          let hiResLayerIdx = -1;
          let hiResCrossfadeAlpha = 0;
          if (cloudSource === Source.FamousGalaxy && hiResFamous !== undefined) {
            const s = hiResFamous.lastOutput.byFamousIdx.get(i);
            if (s !== undefined) {
              hiResLayerIdx = s.hiResLayerIdx;
              hiResCrossfadeAlpha = s.hiResCrossfadeAlpha;
            }
          }
          stickyDisks.set(i, {
            x,
            y,
            z,
            sizeWorld: sizeForInstance,
            u0,
            v0,
            u1,
            v1,
            axisRatio: axisRatioForInstance,
            positionAngleDeg: paForInstance,
            fadeAlpha,
            hiResLayerIdx,
            hiResCrossfadeAlpha,
            nucleusOffset: nucleus,
          });
        }
      }

      strideStartBySource.set(cloudSource, end >= count ? 0 : end);

      for (const d of stickyDisks.values()) disks.push(d);
    }

    const camPosX = cam.position[0];
    const camPosY = cam.position[1];
    const camPosZ = cam.position[2];
    const cmpFar = (
      a: { x: number; y: number; z: number },
      b: { x: number; y: number; z: number },
    ): number => {
      const dax = a.x - camPosX;
      const day = a.y - camPosY;
      const daz = a.z - camPosZ;
      const dbx = b.x - camPosX;
      const dby = b.y - camPosY;
      const dbz = b.z - camPosZ;
      return dbx * dbx + dby * dby + dbz * dbz - (dax * dax + day * day + daz * daz);
    };
    disks.sort(cmpFar);

    lastOutput = { disks };
    return lastOutput;
  }

  function hasInFlightWork(): boolean {
    if (atlas.inFlightCount() > 0) return true;
    if (bitmapReadyTime.size === 0) return false;
    const nowMs = performance.now();
    for (const t of bitmapReadyTime.values()) {
      if (nowMs - t < LOAD_FADE_MS) return true;
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
