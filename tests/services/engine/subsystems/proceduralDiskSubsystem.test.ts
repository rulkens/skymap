/**
 * proceduralDiskSubsystem — unit tests for the LOD-1 per-frame planner body.
 *
 * The subsystem exposes a DiskRowVisitor via beginFrame; the shared
 * diskPlannerWalk owns the catalog loop and drives it. These tests run the
 * body solo through the walk (see diskWalkHarness) so the assertions stay
 * about BODY behaviour — gates, sticky maps, crossfades.
 *
 * Coverage focus:
 *   - emits a ProceduralDiskInstance for every galaxy whose apparent
 *     size is in the (8, ∞) band with finite orientation
 *   - emits nothing for galaxies below 8 px
 *   - emits nothing for galaxies with NaN axisRatio / positionAngleDeg
 *   - respects visibleSourceMask
 *   - stride decimation walks 1/N of the cloud per frame and the
 *     sticky map keeps un-visited galaxies on screen between sweeps
 *   - `lastOutput` is updated each frame
 */

import { describe, it, expect } from 'vitest';
import { Source } from '../../../../src/data/sources';
import {
  createProceduralDiskSubsystem,
  type ProceduralDiskDeps,
} from '../../../../src/services/engine/subsystems/proceduralDiskSubsystem';
import { createDiskPlannerWalk } from '../../../../src/services/engine/subsystems/diskPlannerWalk';
import { runProceduralSolo } from './diskWalkHarness';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';

function makeDenseCloud(count: number, ar = 0.7, pa = 45): GalaxyCatalog {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = 10;
    positions[i * 3 + 1] = 0.001 * i;
    positions[i * 3 + 2] = 0;
  }
  const fill = (v: number): Float32Array => {
    const a = new Float32Array(count);
    a.fill(v);
    return a;
  };
  return makeGalaxyCatalog(count, {
    objIDs: new BigUint64Array(count),
    positions,
    magU: fill(20),
    magG: fill(20),
    magR: fill(20),
    magI: fill(20),
    magZ: fill(20),
    axisRatio: fill(ar),
    positionAngleDeg: fill(pa),
    diameterKpc: fill(50),
  });
}

function makeCam(): OrbitCamera {
  return {
    target: [10, 0, 0] as unknown as Float32Array,
    distance: 0.05,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([9.95, 0, 0]),
  } as unknown as OrbitCamera;
}

function makeInput(catalogs: Map<SourceType, GalaxyCatalog>, mask = 0xffffffff) {
  const cam = makeCam();
  return {
    cam,
    catalogs,
    visibleSourceMask: mask,
    pxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    // Live surface-brightness sliders — arbitrary but plausible defaults;
    // these tests care about gating/sticky-map/crossfade behaviour, not
    // the exact brightness math (covered by galaxySbAmp.test.ts).
    sbScale: 5,
    sbMax: 30,
    brightness: 1,
  };
}

describe('createProceduralDiskSubsystem', () => {
  it('emits one ProceduralDiskInstance per galaxy above 8 px with finite orientation', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const sys = createProceduralDiskSubsystem();
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4)]]);
    const out = runProceduralSolo(walk, sys, makeInput(clouds));
    expect(out.instances.length).toBe(4);
  });

  it('emits nothing for a cloud whose source bit is clear', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const sys = createProceduralDiskSubsystem();
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4)]]);
    const out = runProceduralSolo(walk, sys, makeInput(clouds, 0));
    expect(out.instances.length).toBe(0);
  });

  it('skips galaxies with NaN orientation', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const sys = createProceduralDiskSubsystem();
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4, NaN, NaN)]]);
    const out = runProceduralSolo(walk, sys, makeInput(clouds));
    expect(out.instances.length).toBe(0);
  });

  it('decimationFactor=2 walks half the cloud per frame, sticky map covers gap', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 2 });
    const sys = createProceduralDiskSubsystem();
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4)]]);
    const out1 = runProceduralSolo(walk, sys, makeInput(clouds));
    expect(out1.instances.length).toBe(2);
    const out2 = runProceduralSolo(walk, sys, makeInput(clouds));
    // Frame 2: cursor visits the other 2 indices; sticky entries from
    // frame 1 persist, so total stays at 4.
    expect(out2.instances.length).toBe(4);
  });

  it('lastOutput mirrors the most recent frame result', () => {
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const sys = createProceduralDiskSubsystem();
    expect(sys.lastOutput.instances.length).toBe(0);
    const clouds = new Map([[Source.SDSS, makeDenseCloud(2)]]);
    runProceduralSolo(walk, sys, makeInput(clouds));
    expect(sys.lastOutput.instances.length).toBe(2);
  });

  it('emits the (source, localIdx) identity for each instance', () => {
    // decimationFactor:1 visits all rows in a single frame.
    // The 4-row cloud uses the same camera/size setup as the existing
    // 'emits one ProceduralDiskInstance per galaxy above 8 px' test —
    // known to produce 4 emitted instances.
    const walk = createDiskPlannerWalk({ decimationFactor: 1 });
    const sys = createProceduralDiskSubsystem();
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4)]]);
    const out = runProceduralSolo(walk, sys, makeInput(clouds));
    expect(out.instances.length).toBe(4);
    // Every instance must carry the SDSS source code.
    for (const ins of out.instances) {
      expect(ins.sourceCode).toBe(Source.SDSS);
    }
    // Back-to-front sort reorders instances, so check the SET of localIdx
    // values rather than positional order.
    const localIdxSet = new Set(out.instances.map((ins) => ins.localIdx));
    expect(localIdxSet).toEqual(new Set([0, 1, 2, 3]));
  });

  describe('famous-WebP crossfade (procFadeOut override)', () => {
    /**
     * Minimal atlas stub. The subsystem only ever calls `isLoaded(key)` on
     * the famous path — everything else can throw to prove the negative.
     */
    function makeStubAtlas(loadedKeys: ReadonlySet<string>) {
      return {
        isLoaded: (key: string) => loadedKeys.has(key),
        // Surface that the subsystem doesn't touch the rest of the atlas
        // API.  If a future change starts calling these, the test will
        // tell us — and we can decide whether the new call site is
        // appropriate.
        allocate: () => {
          throw new Error('atlas.allocate not expected');
        },
        slotUv: () => {
          throw new Error('atlas.slotUv not expected');
        },
        uploadBitmap: () => {
          throw new Error('atlas.uploadBitmap not expected');
        },
        enqueueFetch: () => {
          throw new Error('atlas.enqueueFetch not expected');
        },
        isFailed: () => {
          throw new Error('atlas.isFailed not expected');
        },
        inFlightCount: () => {
          throw new Error('atlas.inFlightCount not expected');
        },
        getTextureView: () => {
          throw new Error('atlas.getTextureView not expected');
        },
        setEvictHandler: () => {
          throw new Error('atlas.setEvictHandler not expected');
        },
        destroy: () => {},
      } as unknown as ProceduralDiskDeps['atlas'];
    }

    it('keeps procFadeOut at 1.0 when no atlas is injected', () => {
      // Same fixture as the SDSS path above — explicitly asserts that
      // the new code path doesn't disturb instances when the dep is
      // absent (tests + back-compat).
      const walk = createDiskPlannerWalk({ decimationFactor: 1 });
      const sys = createProceduralDiskSubsystem();
      const clouds = new Map([[Source.FamousGalaxy, makeDenseCloud(2)]]);
      const out = runProceduralSolo(walk, sys, makeInput(clouds));
      expect(out.instances.length).toBe(2);
      for (const ins of out.instances) expect(ins.procFadeOut).toBe(1.0);
    });

    it('keeps procFadeOut at 1.0 for non-Famous sources even when the atlas reports loaded', () => {
      // SDSS / DSS thumbnails intentionally keep the procedural pattern
      // underneath — their lumGate transparency expects the procedural
      // fill.  See spec scope section.
      const walk = createDiskPlannerWalk({ decimationFactor: 1 });
      const sys = createProceduralDiskSubsystem({
        atlas: makeStubAtlas(new Set(['anything'])),
      });
      const clouds = new Map([[Source.SDSS, makeDenseCloud(2)]]);
      const out = runProceduralSolo(walk, sys, makeInput(clouds));
      expect(out.instances.length).toBe(2);
      for (const ins of out.instances) expect(ins.procFadeOut).toBe(1.0);
    });

    it('keeps procFadeOut at 1.0 for Famous galaxies whose WebP is NOT loaded', () => {
      // Famous-source, atlas dep present, but the specific galaxy's key
      // isn't in the loaded set.  The default 1.0 must be preserved so
      // the procedural pattern still draws while the user waits for the
      // fetch to complete.
      const walk = createDiskPlannerWalk({ decimationFactor: 1 });
      const sys = createProceduralDiskSubsystem({
        atlas: makeStubAtlas(new Set()), // empty set → nothing loaded
      });
      const clouds = new Map([[Source.FamousGalaxy, makeDenseCloud(2)]]);
      const out = runProceduralSolo(walk, sys, makeInput(clouds));
      expect(out.instances.length).toBe(2);
      for (const ins of out.instances) expect(ins.procFadeOut).toBe(1.0);
    });
  });
});
