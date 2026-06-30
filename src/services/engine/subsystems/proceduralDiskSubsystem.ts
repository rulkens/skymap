/**
 * proceduralDiskSubsystem — LOD-1 per-frame planner.
 *
 * Owns the catalog walk, apparent-size + finite-orientation gating,
 * stride decimation, per-source sticky map, back-to-front sort, and
 * the `ProceduralDiskInstance[]` output array.
 *
 * No GPU work: reads catalog buffers and emits a sorted array;
 * `proceduralDisksPass` consumes it next frame. Shares the per-row
 * helpers in `utils/render/disk/` with the LOD-2 textured planner.
 *
 * This planner and the textured one currently walk the catalogs
 * separately (own stride cursor each); folding them into one shared walk
 * is the deferred perf item `backlog/2026-06-30-unify-disk-planner-walks.md`.
 *
 * `PROCEDURAL_DISK_FADE_START_PX` / `PROCEDURAL_DISK_FADE_END_PX` and
 * `maybeEmitProceduralDisk` live here — the LOD-aligned source of truth
 * the points-pass wiring in `runFrame.ts` imports.
 */

import { Source } from '../../../data/sources';
import { pickColourIndex } from '../../../data/galaxyCatalog/colourIndex';
import { cartesianToRaDec, smoothstep } from '../../../utils/math';
import { apparentSizePxAtDistance } from '../../../utils/render/disk/apparentSizePxAtDistance';
import { maxVisibleCamDistSq } from '../../../utils/render/disk/maxVisibleCamDistSq';
import { diskQuadExtentMpc } from '../../../utils/render/disk/diskQuadExtentMpc';
import { strideWindow } from '../../../utils/render/disk/strideWindow';
import { purgeStrideWindow } from '../../../utils/render/disk/purgeStrideWindow';
import { byDistanceToCamera } from '../../../utils/render/disk/byDistanceToCamera';
import { galaxyCacheKey } from '../../../utils/render/disk/galaxyCacheKey';
import { APPARENT_SIZE_THRESHOLD_PX, FADE_BAND_PX } from './texturedDiskSubsystem';
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
  const crossfadeAlpha = smoothstep(fadeStartPx, fadeEndPx, px);
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
   * Optional. Drives the famous-WebP crossfade-out: when a famous galaxy's
   * curated WebP is loaded in the atlas, that instance's `procFadeOut` ramps
   * down. Omit it (e.g. in tests) and `procFadeOut` stays 1.0 throughout.
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

    // Below PROCEDURAL_DISK_FADE_START_PX a galaxy doesn't enter the loop body
    // at all (the LOD-1 gate).  The squared-distance early-out uses this band's
    // lower edge as the px threshold so we don't skip anything that could emit.
    const maxCamDistSqUpper = maxVisibleCamDistSq(PROCEDURAL_DISK_FADE_START_PX, pxPerRad);

    const cx = cam.position[0];
    const cy = cam.position[1];
    const cz = cam.position[2];

    const proceduralDisks: ProceduralDiskInstance[] = [];

    for (const [source, catalog] of catalogs.entries()) {
      let stickyProcDisks = stickyProcDisksBySource.get(source);
      if (!stickyProcDisks) {
        stickyProcDisks = new Map();
        stickyProcDisksBySource.set(source, stickyProcDisks);
      }

      if (((visibleSourceMask >> source) & 1) === 0) {
        stickyProcDisks.clear();
        continue;
      }

      const positions = catalog.positions;
      const count = catalog.count;
      const { safeStart, end, nextStart } = strideWindow(
        count,
        decimationFactor,
        strideStartBySource.get(source) ?? 0,
      );

      // Purge sticky entries inside the current stride window — the
      // inner loop is authoritative for those indices.
      purgeStrideWindow(stickyProcDisks, safeStart, end);

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

        if (px <= PROCEDURAL_DISK_FADE_START_PX) continue;

        const sizeWorldMpc = diskQuadExtentMpc(dKpcRow);
        const ar = catalog.axisRatio[i]!;
        const pa = catalog.positionAngleDeg[i]!;

        // Distance from origin (NOT from camera) — K-correction uses
        // cosmological redshift z = d / Hubble distance, which is a
        // function of the row's position, not the viewer's location.
        const dMpcFromOrigin = Math.hypot(x, y, z);
        const colourIndex = pickColourIndex(
          source,
          catalog.magU[i]!,
          catalog.magG[i]!,
          catalog.magR[i]!,
          catalog.magI[i]!,
          catalog.magZ[i]!,
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
          source,
          i,
        );
        if (emitted) {
          // Famous-WebP crossfade-OUT: once a famous galaxy's curated WebP
          // loads, ramp the procedural alpha down across the textured-disk
          // fade-IN band so the two passes hand off in lockstep. Everything
          // else keeps procFadeOut at 1.0.
          let final = emitted;
          if (atlas && source === Source.FamousGalaxy) {
            const [ra, dec] = cartesianToRaDec(x, y, z);
            const key = galaxyCacheKey(ra, dec);
            if (atlas.isLoaded(key)) {
              const fadeIn = smoothstep(
                APPARENT_SIZE_THRESHOLD_PX,
                APPARENT_SIZE_THRESHOLD_PX + FADE_BAND_PX,
                px,
              );
              final = { ...emitted, procFadeOut: 1 - fadeIn };
            }
          }
          stickyProcDisks.set(i, final);
        }
      }

      strideStartBySource.set(source, nextStart);

      for (const p of stickyProcDisks.values()) proceduralDisks.push(p);
    }

    // Back-to-front sort for correct alpha compositing — same idiom
    // as texturedDiskSubsystem's disk sort.
    proceduralDisks.sort(byDistanceToCamera(cam.position));

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
