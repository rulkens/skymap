/**
 * proceduralDiskSubsystem — LOD-1 per-frame planner.
 *
 * Owns the catalog walk, apparent-size + finite-orientation gating,
 * stride decimation, per-source sticky map, back-to-front sort, and
 * the `ProceduralDiskInstance[]` output array.
 *
 * No GPU work.  Subsystem reads catalog buffers and emits a sorted
 * array; `proceduralDisksPass` consumes the array next frame.
 *
 * ### Why a separate stride cursor from the LOD-2 planner
 *
 * The two planners each walk the catalog every frame with their own
 * stride cursor.  The spec's "two walks vs. one shared" analysis
 * settled on two: per-row cost is dominated by the squared-distance
 * compare which neither planner can make cheaper, the per-frame
 * sticky-map updates are independent (LOD-1 emits ProceduralDiskInstance,
 * LOD-2 emits ThumbnailInstance/DiskInstance), and a shared walk
 * would just be an outer loop wrapping two independent inner bodies —
 * recreating the kitchen-sink concern the split exists to eliminate.
 *
 * ### Tunables
 *
 * `PROCEDURAL_DISK_FADE_START_PX` / `PROCEDURAL_DISK_FADE_END_PX` and
 * `maybeEmitProceduralDisk` live here — the LOD-aligned source of
 * truth.  The points-pass settings wiring in `runFrame.ts` imports
 * them from this module.
 */

import { Source } from '../../../data/sources';
import { pickColourIndex } from '../../../data/galaxyCatalog/colourIndex';
import { paddedRadiusMpc } from '../../../utils/paddedRadiusMpc';
import { cartesianToRaDec } from '../../../utils/math';
import { APPARENT_SIZE_THRESHOLD_PX, FADE_BAND_PX, galaxyCacheKey } from './texturedDiskSubsystem';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { GalaxyAtlasSubsystem } from '../../../@types/engine/subsystems/GalaxyAtlasSubsystem';
import type { ProceduralDiskInstance } from '../../../@types/rendering/ProceduralDiskInstance';
import type { SourceType } from '../../../@types/data/SourceType';
import type {
  ProceduralDiskFrameInput,
  ProceduralDiskFrameOutput,
  ProceduralDiskSubsystem,
} from '../../../@types/engine/subsystems/ProceduralDiskSubsystem';

/**
 * Point-sprite → procedural-disk crossfade band (px of apparent size).
 * Below the start the sprite carries fully and the disk is skipped;
 * the disk smoothsteps in across the band.
 */
export const PROCEDURAL_DISK_FADE_START_PX = 8;
export const PROCEDURAL_DISK_FADE_END_PX = 14;

/** Squared-distance early-out bound — no real galaxy exceeds this. */
const MAX_PLAUSIBLE_DIAMETER_KPC = 200;

/**
 * Decide whether (and how) to emit a per-frame ProceduralDiskInstance.
 * Pure helper (no captured state) so the gate + smoothstep crossfade
 * are unit-testable without a planner.
 *
 * `procFadeOut` defaults to 1.0 (no fade-out against the textured-disk
 * pass). The caller in `runFrame` overrides it for famous galaxies
 * whose curated WebP is loaded into the atlas — see the famous-WebP
 * crossfade comment at the override site.
 */
export function maybeEmitProceduralDisk(
  px: number,
  ar: number,
  pa: number,
  x: number,
  y: number,
  z: number,
  sizeWorldMpc: number,
  colourIndex: number,
  fadeStartPx: number,
  fadeEndPx: number,
  sourceCode: SourceType,
  localIdx: number,
): ProceduralDiskInstance | null {
  if (px <= fadeStartPx) return null;
  if (!Number.isFinite(ar) || !Number.isFinite(pa)) return null;
  const t = Math.min(1, Math.max(0, (px - fadeStartPx) / (fadeEndPx - fadeStartPx)));
  const crossfadeAlpha = t * t * (3 - 2 * t);
  return {
    x,
    y,
    z,
    sizeWorldMpc,
    axisRatio: ar,
    positionAngleDeg: pa,
    colourIndex,
    crossfadeAlpha,
    procFadeOut: 1.0,
    sourceCode,
    localIdx,
  };
}

export type ProceduralDiskDeps = {
  /** Defaults to 8.  Tests pass 1 to disable decimation. */
  readonly decimationFactor?: number;
  /**
   * Optional. When provided, the subsystem queries the atlas every frame
   * to decide which Famous-source galaxies have their curated WebP
   * loaded; those instances get a ramped `procFadeOut` so the procedural
   * pattern crossfades out under the textured-disk pass.  When omitted
   * (e.g. tests that don't care about the famous-WebP crossfade),
   * `procFadeOut` stays at its 1.0 default for every emitted instance
   * — the procedural pattern renders at full strength.
   */
  readonly atlas?: GalaxyAtlasSubsystem;
};

export function createProceduralDiskSubsystem(
  deps: ProceduralDiskDeps = {},
): ProceduralDiskSubsystem {
  const decimationFactor = Math.max(1, Math.floor(deps.decimationFactor ?? 8));
  const atlas = deps.atlas;

  const stickyProcDisksBySource = new Map<SourceType, Map<number, ProceduralDiskInstance>>();
  const strideStartBySource = new Map<SourceType, number>();

  // Initialised to a frozen empty output so consumers that read
  // `lastOutput` before the first runFrame see valid data.
  let lastOutput: ProceduralDiskFrameOutput = { instances: [] };

  function runFrame(input: ProceduralDiskFrameInput): ProceduralDiskFrameOutput {
    const { cam, catalogs, visibleSourceMask, pxPerRad } = input;

    const dMpcMax = MAX_PLAUSIBLE_DIAMETER_KPC / 1000;
    // Below PROCEDURAL_DISK_FADE_START_PX a galaxy doesn't enter the loop body
    // at all (the LOD-1 gate).  The squared-distance early-out uses this band's
    // lower edge as the upper bound so we don't skip anything that could emit.
    const maxCamDistForVisibilityUpper = (dMpcMax * pxPerRad) / PROCEDURAL_DISK_FADE_START_PX;
    const maxCamDistSqUpper = maxCamDistForVisibilityUpper * maxCamDistForVisibilityUpper;

    const cx = cam.position[0];
    const cy = cam.position[1];
    const cz = cam.position[2];

    const proceduralDisks: ProceduralDiskInstance[] = [];

    for (const [cloudSource, cloud] of catalogs.entries()) {
      let stickyProcDisks = stickyProcDisksBySource.get(cloudSource);
      if (!stickyProcDisks) {
        stickyProcDisks = new Map();
        stickyProcDisksBySource.set(cloudSource, stickyProcDisks);
      }

      if (((visibleSourceMask >> cloudSource) & 1) === 0) {
        stickyProcDisks.clear();
        continue;
      }

      const positions = cloud.positions;
      const count = cloud.count;
      const stride = Math.max(1, Math.ceil(count / decimationFactor));
      const start = strideStartBySource.get(cloudSource) ?? 0;
      const safeStart = start >= count ? 0 : start;
      const end = Math.min(safeStart + stride, count);

      // Purge sticky entries inside the current stride window — the
      // inner loop is authoritative for those indices.
      const drop: number[] = [];
      for (const k of stickyProcDisks.keys()) {
        if (k >= safeStart && k < end) drop.push(k);
      }
      for (const k of drop) stickyProcDisks.delete(k);

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

        if (px <= PROCEDURAL_DISK_FADE_START_PX) continue;

        // posSize.w stores the FULL quad extent (vertex stage halves it
        // at corner expansion), so double the shared radius helper.
        const sizeWorldMpc = paddedRadiusMpc(dKpcRow) * 2;
        const ar = cloud.axisRatio[i]!;
        const pa = cloud.positionAngleDeg[i]!;

        // Distance from origin (NOT from camera) — K-correction uses
        // cosmological redshift z = d / Hubble distance, which is a
        // function of the row's position, not the viewer's location.
        const dMpcFromOrigin = Math.hypot(x, y, z);
        const colourIndex = pickColourIndex(
          cloudSource,
          cloud.magU[i]!,
          cloud.magG[i]!,
          cloud.magR[i]!,
          cloud.magI[i]!,
          cloud.magZ[i]!,
          dMpcFromOrigin,
        );

        const emitted = maybeEmitProceduralDisk(
          px,
          ar,
          pa,
          x,
          y,
          z,
          sizeWorldMpc,
          colourIndex,
          PROCEDURAL_DISK_FADE_START_PX,
          PROCEDURAL_DISK_FADE_END_PX,
          cloudSource,
          i,
        );
        if (emitted) {
          // Famous-WebP crossfade-OUT.  For Famous-source galaxies
          // whose curated WebP has loaded into the atlas, ramp the
          // procedural pattern's alpha down across the textured-disk
          // fade-IN band so the two passes crossfade in lockstep —
          // the curated photo replaces the procedural cleanly without
          // the procedural pattern bleeding through the WebP's dark
          // pixels (the texturedDisks luminance-gate is intentionally
          // permissive to let SDSS / DSS cutouts keep filling the
          // ellipse around their small-galaxy-in-wide-cutout subjects;
          // famous WebPs are full-frame and don't want that fill).
          //
          // Non-famous galaxies and famous galaxies without a loaded
          // bitmap keep the default 1.0 — no behaviour change.
          let final = emitted;
          if (atlas && cloudSource === Source.FamousGalaxy) {
            const [ra, dec] = cartesianToRaDec(x, y, z);
            const key = galaxyCacheKey(ra, dec);
            if (atlas.isLoaded(key)) {
              const t = Math.min(1, Math.max(0, (px - APPARENT_SIZE_THRESHOLD_PX) / FADE_BAND_PX));
              const fadeIn = t * t * (3 - 2 * t);
              final = { ...emitted, procFadeOut: 1 - fadeIn };
            }
          }
          stickyProcDisks.set(i, final);
        }
      }

      strideStartBySource.set(cloudSource, end >= count ? 0 : end);

      for (const p of stickyProcDisks.values()) proceduralDisks.push(p);
    }

    // Back-to-front sort for correct alpha compositing — same idiom
    // as texturedDiskSubsystem's disk sort.
    const camPosX = cam.position[0];
    const camPosY = cam.position[1];
    const camPosZ = cam.position[2];
    proceduralDisks.sort((a, b) => {
      const dax = a.x - camPosX;
      const day = a.y - camPosY;
      const daz = a.z - camPosZ;
      const dbx = b.x - camPosX;
      const dby = b.y - camPosY;
      const dbz = b.z - camPosZ;
      return dbx * dbx + dby * dby + dbz * dbz - (dax * dax + day * day + daz * daz);
    });

    lastOutput = { instances: proceduralDisks };
    return lastOutput;
  }

  function destroy(): void {
    stickyProcDisksBySource.clear();
    strideStartBySource.clear();
    lastOutput = { instances: [] };
  }

  const subsystem: ProceduralDiskSubsystem = {
    runFrame,
    get lastOutput() {
      return lastOutput;
    },
    destroy,
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
