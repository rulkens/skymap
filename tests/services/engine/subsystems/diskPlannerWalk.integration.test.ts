/**
 * diskPlannerWalk.integration — the two disk-planner bodies driven by ONE walk.
 *
 * The subsystem unit suites (proceduralDiskSubsystem.test / texturedDiskSubsystem.test)
 * each drive a single body SOLO through the walk (the other visitor slot stubbed).
 * This suite is the merge itself: one `walk.runFrame(input, procedural, textured)`
 * call driving BOTH real bodies from a single shared cursor. It pins:
 *
 *   1. Parity — a merged run produces byte-identical output to running each body
 *      solo against the same input (the shared geometry doesn't perturb either body).
 *   2. One shared stride window — both bodies advance through the SAME decimated
 *      window each frame (one cursor), not two independent ones.
 *   3. The documented behaviour change — under the looser 8-px distance bound,
 *      famous rows reach the textured body (and prefetch) at ~3× the distance
 *      today's 24-px textured bound allowed; a non-famous row of identical geometry
 *      still hits the 24-px skip and fetches nothing.
 *   4. One `runFrame` call populates BOTH bodies' `lastOutput` in a single frame.
 */

import { describe, it, expect, vi } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { createProceduralDiskSubsystem } from '../../../../src/services/engine/subsystems/proceduralDiskSubsystem';
import { createTexturedDiskSubsystem } from '../../../../src/services/engine/subsystems/texturedDiskSubsystem';
import { createGalaxyAtlasSubsystem } from '../../../../src/services/engine/subsystems/galaxyAtlasSubsystem';
import { createDiskPlannerWalk } from '../../../../src/services/engine/subsystems/diskPlannerWalk';
import { runProceduralSolo, runTexturedSolo } from './diskWalkHarness';
import { cartesianToRaDec } from '../../../../src/utils/math';
import { galaxyCacheKey } from '../../../../src/utils/render/disk/galaxyCacheKey';
import {
  PROCEDURAL_DISK_FADE_START_PX,
  APPARENT_SIZE_THRESHOLD_PX,
} from '../../../../src/data/galaxyLodBands';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';

// ── Fixtures (same idioms as the two subsystem suites) ──────────────────────

function makeFakeDevice(): GPUDevice {
  const fakeTexture = { createView: () => ({}) as GPUTextureView };
  const queue = {
    copyExternalImageToTexture: vi.fn(),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
    submit: vi.fn(),
  };
  return { createTexture: vi.fn(() => fakeTexture), queue } as unknown as GPUDevice;
}

function makeFakeBitmap(): ImageBitmap {
  return { width: 128, height: 128, close: () => {} } as unknown as ImageBitmap;
}

/** A dense cloud at x=10 (near the camera → huge px, well past every gate). */
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

/** A single-row cloud at (x, 0, 0) with a chosen diameter — used to place a row
 *  at a precise camera distance for the prefetch-bound test. */
function makeSingletonCloud(x: number, diameterKpc: number): GalaxyCatalog {
  const positions = new Float32Array([x, 0, 0]);
  const fill = (v: number): Float32Array => new Float32Array([v]);
  return makeGalaxyCatalog(1, {
    objIDs: new BigUint64Array(1),
    positions,
    magU: fill(20),
    magG: fill(20),
    magR: fill(20),
    magI: fill(20),
    magZ: fill(20),
    axisRatio: fill(0.7),
    positionAngleDeg: fill(45),
    diameterKpc: fill(diameterKpc),
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

function pxPerRadFor(cam: OrbitCamera): number {
  return 720 / (2 * Math.tan(cam.fovYRad / 2));
}

function makeInput(catalogs: Map<SourceType, GalaxyCatalog>, mask = 0xffffffff) {
  const cam = makeCam();
  return {
    cam,
    catalogs,
    visibleSourceMask: mask,
    pxPerRad: pxPerRadFor(cam),
    // Live surface-brightness sliders — arbitrary plausible defaults; this
    // suite is about parity between merged/solo walks, not brightness math.
    sbScale: 5,
    sbMax: 30,
    brightness: 1,
  };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// A merged rig: the two real bodies plus their own atlas + one shared walk.
// Procedural takes no atlas (the famous-WebP crossfade is off, so parity with
// the solo procedural baseline — which also has no atlas — holds).
function makeMergedRig() {
  const device = makeFakeDevice();
  const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
  const proc = createProceduralDiskSubsystem();
  const tex = createTexturedDiskSubsystem({ device, atlas, fetcher: async () => makeFakeBitmap() });
  const walk = createDiskPlannerWalk({ decimationFactor: 1 });
  return { atlas, proc, tex, walk };
}

function driveMerged(
  rig: ReturnType<typeof makeMergedRig>,
  input: ReturnType<typeof makeInput>,
  nowMs: number,
): void {
  const texInput = { ...input, famousGalaxiesMeta: [], nowMs };
  rig.walk.runFrame(input, rig.proc.beginFrame(input), rig.tex.beginFrame(texInput));
}

describe('diskPlannerWalk drives both bodies', () => {
  it('one walk drives both bodies with output identical to running each solo', async () => {
    // A famous cloud and a non-famous cloud — both near the camera, so every
    // row clears both bodies' px gates and emits.
    const catalogs = new Map<SourceType, GalaxyCatalog>([
      [Source.FamousGalaxy, makeDenseCloud(2)],
      [Source.SDSS, makeDenseCloud(2)],
    ]);
    const input = makeInput(catalogs); // read-only; reused across all three runs

    // ── Merged run: ONE walk, both real bodies, two frames (frame 1 kicks off
    // fetches, frame 2 — clock +50 ms — emits textured disks at loadFade 0.125).
    const rig = makeMergedRig();
    driveMerged(rig, input, 0);
    await tick();
    driveMerged(rig, input, 50);

    // ── Procedural baseline: FRESH subsystem + walk (sticky maps + cursors are
    // stateful, so contaminated instances would give a false parity). Procedural
    // is synchronous per frame; two frames mirror the merged sequence.
    const procWalk = createDiskPlannerWalk({ decimationFactor: 1 });
    const procSolo = createProceduralDiskSubsystem();
    runProceduralSolo(procWalk, procSolo, input);
    await tick();
    runProceduralSolo(procWalk, procSolo, input);

    // ── Textured baseline: FRESH atlas + subsystem + walk, same two-frame clock.
    const texDevice = makeFakeDevice();
    const texAtlas = createGalaxyAtlasSubsystem({ device: texDevice, requestRender: () => {} });
    const texSolo = createTexturedDiskSubsystem({
      device: texDevice,
      atlas: texAtlas,
      fetcher: async () => makeFakeBitmap(),
    });
    const texWalk = createDiskPlannerWalk({ decimationFactor: 1 });
    runTexturedSolo(texWalk, texSolo, { ...input, famousGalaxiesMeta: [], nowMs: 0 });
    await tick();
    runTexturedSolo(texWalk, texSolo, { ...input, famousGalaxiesMeta: [], nowMs: 50 });

    // Guard against a vacuous [] === [] parity: both bodies actually emitted.
    expect(rig.proc.lastOutput.instances.length).toBeGreaterThan(0);
    expect(rig.tex.lastOutput.disks.length).toBeGreaterThan(0);

    // Merge is transparent: identical output either way.
    expect(rig.proc.lastOutput.instances).toEqual(procSolo.lastOutput.instances);
    expect(rig.tex.lastOutput.disks).toEqual(texSolo.lastOutput.disks);
  });

  it('one walk.runFrame call populates BOTH lastOutputs in a single frame', async () => {
    // Deferred from Task 3: the single frame call drives both slots. Warm the
    // atlas so the textured body has a bitmap to emit on the observed frame.
    const catalogs = new Map<SourceType, GalaxyCatalog>([[Source.SDSS, makeDenseCloud(2)]]);
    const input = makeInput(catalogs);

    const rig = makeMergedRig();
    driveMerged(rig, input, 0);
    await tick();

    const procBefore = rig.proc.lastOutput;
    const texBefore = rig.tex.lastOutput;

    // ONE call — both bodies' lastOutput must be replaced and non-empty.
    driveMerged(rig, input, 50);

    expect(rig.proc.lastOutput).not.toBe(procBefore);
    expect(rig.tex.lastOutput).not.toBe(texBefore);
    expect(rig.proc.lastOutput.instances.length).toBeGreaterThan(0);
    expect(rig.tex.lastOutput.disks.length).toBeGreaterThan(0);
  });

  it('both bodies see the same shared stride window each frame', () => {
    // decimationFactor 2 over a 6-row cloud → stride ceil(6/2)=3. The single
    // shared cursor yields window {0,1,2} on frame 1, {3,4,5} on frame 2. Both
    // bodies must advance through the SAME window (one cursor), not independently.
    const count = 6;
    const catalogs = new Map<SourceType, GalaxyCatalog>([[Source.SDSS, makeDenseCloud(count)]]);
    const input = makeInput(catalogs);

    // Key → local-index map: the textured body enqueues by RA/Dec-derived key;
    // rows sit at (10, 0.001*i, 0), so each row has a distinct key we can map back.
    const keyToIdx = new Map<string, number>();
    for (let i = 0; i < count; i++) {
      const [ra, dec] = cartesianToRaDec(10, 0.001 * i, 0);
      keyToIdx.set(galaxyCacheKey(ra, dec), i);
    }

    const device = makeFakeDevice();
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const enqueueSpy = vi.spyOn(atlas, 'enqueueFetch');
    const proc = createProceduralDiskSubsystem();
    const tex = createTexturedDiskSubsystem({
      device,
      atlas,
      fetcher: async () => makeFakeBitmap(),
    });
    const walk = createDiskPlannerWalk({ decimationFactor: 2 });

    const texWindow = (): Set<number> =>
      new Set(enqueueSpy.mock.calls.map((c) => keyToIdx.get(c[0].key)!));

    // ── Frame 1: sticky maps are empty, so procedural's lastOutput IS this
    // frame's window; textured enqueues a fetch per freshly-visited row.
    walk.runFrame(
      input,
      proc.beginFrame(input),
      tex.beginFrame({ ...input, famousGalaxiesMeta: [], nowMs: 0 }),
    );
    const procWindow1 = new Set(proc.lastOutput.instances.map((d) => d.localIdx));
    const texWindow1 = texWindow();
    expect(procWindow1).toEqual(new Set([0, 1, 2]));
    expect(texWindow1).toEqual(procWindow1); // both saw the SAME window

    enqueueSpy.mockClear();

    // ── Frame 2: cursor advances. Procedural's sticky map still holds window 1,
    // so the NEWLY-added indices (lastOutput minus frame-1 window) are frame 2's
    // window; textured enqueues only the freshly-visited rows.
    walk.runFrame(
      input,
      proc.beginFrame(input),
      tex.beginFrame({ ...input, famousGalaxiesMeta: [], nowMs: 0 }),
    );
    const procAll2 = new Set(proc.lastOutput.instances.map((d) => d.localIdx));
    const procWindow2 = new Set([...procAll2].filter((i) => !procWindow1.has(i)));
    const texWindow2 = texWindow();
    expect(procWindow2).toEqual(new Set([3, 4, 5]));
    expect(texWindow2).toEqual(procWindow2); // advanced together, same window

    enqueueSpy.mockRestore();
  });

  it('famous rows prefetch earlier under the shared 8px bound', async () => {
    // Place a row between the textured body's 24-px gate and the walk's 8-px
    // distance bound, so it is CLOSE enough to be seen by the shared walk but
    // NOT big enough to clear the 24-px textured gate.
    //
    // px = (diameterKpc/1000 / camDist) * pxPerRad.  With diameter 50 kpc,
    // cam at x=9.95, pxPerRad ≈ 623.54:
    //   camDist = 2.0 Mpc  →  px = (0.05 / 2.0) * 623.54 ≈ 15.59
    // 15.59 lies between 8 (PROCEDURAL_DISK_FADE_START_PX, the walk's distance
    // bound) and 24 (APPARENT_SIZE_THRESHOLD_PX, the textured gate). The row
    // therefore sits at x = 9.95 - 2.0 = 7.95.
    const cam = makeCam();
    const pxPerRad = pxPerRadFor(cam);
    const camDist = 2.0;
    const rowX = cam.position[0]! - camDist; // 7.95
    const diameterKpc = 50;

    // Sanity-pin the fixture: px really is in the (8, 24) band.
    const px = (diameterKpc / 1000 / camDist) * pxPerRad;
    expect(px).toBeGreaterThan(PROCEDURAL_DISK_FADE_START_PX);
    expect(px).toBeLessThan(APPARENT_SIZE_THRESHOLD_PX);

    const [ra, dec] = cartesianToRaDec(rowX, 0, 0);
    const expectedKey = galaxyCacheKey(ra, dec);

    // Run the textured body solo for a source, capturing atlas.enqueueFetch.
    // Returns the spy (its inferred MockInstance type carries `.mock`).
    async function texEnqueueFetchFor(source: SourceType) {
      const device = makeFakeDevice();
      const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
      const spy = vi.spyOn(atlas, 'enqueueFetch');
      const tex = createTexturedDiskSubsystem({
        device,
        atlas,
        fetcher: async () => makeFakeBitmap(),
      });
      const walk = createDiskPlannerWalk({ decimationFactor: 1 });
      const catalogs = new Map<SourceType, GalaxyCatalog>([
        [source, makeSingletonCloud(rowX, diameterKpc)],
      ]);
      runTexturedSolo(walk, tex, { ...makeInput(catalogs), famousGalaxiesMeta: [], nowMs: 0 });
      await tick();
      return spy;
    }

    // Famous: exempt from the 24-px gate, so the shared 8-px bound lets it reach
    // the textured body and prefetch — the documented behaviour change.
    const famousSpy = await texEnqueueFetchFor(Source.FamousGalaxy);
    expect(famousSpy).toHaveBeenCalledTimes(1);
    expect(famousSpy.mock.calls[0]![0].key).toBe(expectedKey);

    // Non-famous: identical geometry, but px < 24 → the textured gate skips it
    // before any allocate/fetch. This proves the famous exemption is what
    // changed, not the gate itself.
    const sdssSpy = await texEnqueueFetchFor(Source.SDSS);
    expect(sdssSpy).not.toHaveBeenCalled();
  });
});
