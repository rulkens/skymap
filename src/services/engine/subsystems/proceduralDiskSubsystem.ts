/**
 * proceduralDiskSubsystem — LOD-1 per-frame planner body.
 *
 * The shared catalog walk ('diskPlannerWalk.ts') owns the loop, the stride
 * cursor, and the per-row geometry (camDist, px); this subsystem owns
 * everything LOD-1-specific: the apparent-size + finite-orientation gate,
 * the per-source sticky map, the famous-WebP crossfade-out, the
 * back-to-front sort, and the 'ProceduralDiskInstance[]' output array.
 * 'beginFrame(input)' returns the DiskRowVisitor the walk drives; the
 * visitor's endFrame stashes the sorted result on 'lastOutput'.
 *
 * No GPU work: reads catalog buffers and emits a sorted array;
 * 'proceduralDisksPass' consumes it next frame. Shares the per-row
 * helpers in 'utils/render/disk/' with the LOD-2 textured body.
 *
 * The LOD-aligned fade constants live in 'data/galaxyLodBands.ts' and the
 * pure emission helper 'maybeEmitProceduralDisk' in 'utils/render/disk/';
 * this planner imports both.
 */

import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { pickColourIndex } from '../../../data/galaxyCatalog/colourIndex';
import { absoluteFromApparent, cartesianToRaDec, smoothstep } from '../../../utils/math';
import { galaxySbAmp } from '../../../utils/galaxy/galaxySbAmp';
import { diskQuadExtentMpc } from '../../../utils/render/disk/diskQuadExtentMpc';
import { purgeStrideWindow } from '../../../utils/render/disk/purgeStrideWindow';
import { byDistanceToCamera } from '../../../utils/render/disk/byDistanceToCamera';
import { galaxyCacheKey } from '../../../utils/render/disk/galaxyCacheKey';
import { maybeEmitProceduralDisk } from '../../../utils/render/disk/maybeEmitProceduralDisk';
import {
  APPARENT_SIZE_THRESHOLD_PX,
  FADE_BAND_PX,
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../../../data/galaxyLodBands';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { DiskRowVisitor } from '../../../@types/engine/subsystems/DiskRowVisitor';
import type { BitmapStreamSubsystem } from '../../../@types/engine/subsystems/BitmapStreamSubsystem';
import type { ProceduralDiskInstance } from '../../../@types/rendering/ProceduralDiskInstance';
import type { SourceType } from '../../../@types/data/SourceType';
import type {
  ProceduralDiskFrameInput,
  ProceduralDiskFrameOutput,
  ProceduralDiskSubsystem,
} from '../../../@types/engine/subsystems/ProceduralDiskSubsystem';

export type ProceduralDiskDeps = {
  /**
   * Optional. Drives the famous-WebP crossfade-out: when a famous galaxy's
   * curated WebP is loaded in the atlas, that instance's `procFadeOut` ramps
   * down. Omit it (e.g. in tests) and `procFadeOut` stays 1.0 throughout.
   */
  readonly atlas?: BitmapStreamSubsystem;
};

export function createProceduralDiskSubsystem(
  deps: ProceduralDiskDeps = {},
): ProceduralDiskSubsystem {
  const atlas = deps.atlas;

  const stickyProcDisksBySource = new Map<SourceType, Map<number, ProceduralDiskInstance>>();

  // Initialised to a frozen empty output so consumers that read
  // `lastOutput` before the first frame see valid data.
  let lastOutput: ProceduralDiskFrameOutput = { instances: [] };

  function stickyFor(source: SourceType): Map<number, ProceduralDiskInstance> {
    let sticky = stickyProcDisksBySource.get(source);
    if (!sticky) {
      sticky = new Map();
      stickyProcDisksBySource.set(source, sticky);
    }
    return sticky;
  }

  function beginFrame(input: ProceduralDiskFrameInput): DiskRowVisitor {
    const camPosition = input.cam.position;
    const { sbScale, sbMax, brightness } = input;
    const proceduralDisks: ProceduralDiskInstance[] = [];

    // Hoisted per source by beginSource so onRow does no map lookup — the
    // walk guarantees beginSource precedes every onRow for that source.
    let stickyProcDisks: Map<number, ProceduralDiskInstance> = new Map();

    const visitor: DiskRowVisitor = {
      onSourceHidden(source) {
        stickyFor(source).clear();
      },

      beginSource(source, safeStart, end) {
        stickyProcDisks = stickyFor(source);
        // Purge sticky entries inside the current stride window — the
        // row visits are authoritative for those indices.
        purgeStrideWindow(stickyProcDisks, safeStart, end);
      },

      onRow(source, catalog, i, x, y, z, _camDist, px) {
        // The LOD-1 gate: below the fade start the point sprite carries and
        // the disk is skipped.  The walk applies no px gate — this threshold
        // is the body's own policy.
        if (px <= PROCEDURAL_DISK_FADE_START_PX) return;

        const dKpcRow = catalog.diameterKpc[i]!;
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

        // The disk recomputes the SAME physical surface brightness the
        // point bake baked (shared `galaxySbAmp` helper + the same
        // per-catalog `medianAbsMag`), pre-scaled by the live sliders, so
        // the point -> disk crossfade holds constant brightness and
        // intrinsically bright galaxies bloom in the disk view too.
        const medianAbsMag = catalog.medianAbsMag ?? -20.5;
        const absMag = absoluteFromApparent(catalog.magG[i]!, dMpcFromOrigin);
        const rawSb = galaxySbAmp(absMag, medianAbsMag, dKpcRow);
        const regEntry = SOURCE_REGISTRY[source];
        const sbBoost = regEntry.type === 'galaxyCatalog' ? regEntry.sbBoost : 1;
        const sbAmp = Math.min(rawSb, sbMax) * sbScale * sbBoost * brightness;

        const emitted = maybeEmitProceduralDisk(
          px,
          ar,
          pa,
          x,
          y,
          z,
          sizeWorldMpc,
          colourIndex,
          sbAmp,
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
      },

      endSource(source) {
        for (const p of stickyFor(source).values()) proceduralDisks.push(p);
      },

      endFrame() {
        // Back-to-front sort for correct alpha compositing — same idiom
        // as the textured body's disk sort.
        proceduralDisks.sort(byDistanceToCamera(camPosition));
        lastOutput = { instances: proceduralDisks };
      },
    };
    return visitor;
  }

  // Calling beginFrame after destroy is safe: all state here is plain maps
  // and arrays with no external resources, so a post-destroy frame simply
  // starts accumulating into fresh (empty) state again.
  function destroy(): void {
    stickyProcDisksBySource.clear();
    lastOutput = { instances: [] };
  }

  const subsystem: ProceduralDiskSubsystem = {
    beginFrame,
    get lastOutput() {
      return lastOutput;
    },
    destroy,
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
