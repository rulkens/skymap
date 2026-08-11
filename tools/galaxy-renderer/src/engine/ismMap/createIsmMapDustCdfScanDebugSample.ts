/**
 * createIsmMapDustCdfScanDebugSample — Task 6's own numeric-validation
 * exception (`ismMapDustCdfScan.wesl` has no production caller yet — Tasks
 * 7/8 wire the real `ISM_MAP_RINGS x ISM_MAP_AZ` texture). Same shape as
 * `createArmRidgeDebugSample.ts`: own fixture, own dispatch, own one-shot
 * readback, no production caller. Differs in ONE way that simplifies the
 * probe: the fixture is real DATA (a small `rgba32float` texture, not baked
 * WGSL consts), so `dispatchAndReadback` hands the fixture's own texel data
 * straight back — `probeGpuErrors.ts` builds its CPU `GalaxyIsmMap`
 * reference from THAT, never a hand-duplicated literal.
 *
 * Task 7's fix round: the fixture also drives the ring-mean-normalised,
 * capped dust density (`dustParticleCloud.ts`'s `density()` closure) that
 * `ismMapDustCdfScan.wesl`'s armBias<=0 branch now always applies — the
 * ring-means buffer is computed CPU-side, ONCE, from the SAME fixture data
 * via `ismMapRingMeans` (the real, unmodified function), uploaded once at
 * construction, so the GPU scan and the probe's own CPU reference can never
 * disagree about what the ring means ARE, only about the scan itself.
 * `DEBUG_RING_CAP` is deliberately non-degenerate: chosen so roughly half
 * this fixture's texels land above their own ring's mean (and so get
 * clamped) and half don't — proving the cap branch fires, not just compiles.
 */
import { createIsmMapDustCdfScan } from './createIsmMapDustCdfScan';
import { ismMapRingMeans } from '../../../../../src/utils/galaxy/ismMapRingMeans';
import type { GalaxyIsmMap } from '../../../../../src/@types/galaxy/GalaxyIsmMap';

const FIXTURE_RINGS = 4;
const FIXTURE_AZ = 8;
const FIXTURE_R_MIN = 1.5;
const FIXTURE_R_MAX = 9.0;

/** Exported so `probeGpuErrors.ts`'s CPU reference dispatches the SAME cap the GPU fixture does — one literal, not two. */
export const DEBUG_RING_CAP = 1.0;

/** Deterministic, non-uniform per-channel values — varied enough that the dust-channel CDF is a real (non-degenerate) monotonic ramp, not a trivial constant-weight case. */
function buildFixtureData(): Float32Array {
  const data = new Float32Array(FIXTURE_RINGS * FIXTURE_AZ * 4);
  for (let ring = 0; ring < FIXTURE_RINGS; ring++) {
    for (let az = 0; az < FIXTURE_AZ; az++) {
      const i = (ring * FIXTURE_AZ + az) * 4;
      const t = ring * FIXTURE_AZ + az;
      data[i] = 0.2 + 0.05 * t; // gas
      data[i + 1] = 0.1 * Math.sin(t) + 0.1; // stars
      data[i + 2] = 0.3 + 0.02 * ring; // activity
      data[i + 3] = 0.5 + 0.1 * Math.cos(t * 0.7) + 0.05 * ring; // dust — always > 0
    }
  }
  return data;
}

export type IsmMapDustCdfScanDebugGrid = {
  readonly rings: number;
  readonly az: number;
  readonly rMin: number;
  readonly rMax: number;
};

export type IsmMapDustCdfScanDebugSample = {
  /** Dust-weight fixture: dispatch the scan and map its prefix buffer back, alongside the raw fixture texels AND the ring cap this dispatch used — the probe's CPU reference needs both, and returning `ringCap` here (rather than a second copy of `DEBUG_RING_CAP` on the tsx/Node side, which cannot import this `?static`-importing module at all) keeps it a single literal. */
  dispatchAndReadback(): Promise<{
    readonly grid: IsmMapDustCdfScanDebugGrid;
    readonly data: readonly number[];
    readonly prefix: readonly number[];
    readonly ringCap: number;
  }>;
  dispose(): void;
};

export function createIsmMapDustCdfScanDebugSample(
  device: GPUDevice,
  deps: { readonly makeShader: (code: string, label: string) => GPUShaderModule },
): IsmMapDustCdfScanDebugSample {
  const grid: IsmMapDustCdfScanDebugGrid = {
    rings: FIXTURE_RINGS,
    az: FIXTURE_AZ,
    rMin: FIXTURE_R_MIN,
    rMax: FIXTURE_R_MAX,
  };
  const fixtureData = buildFixtureData();

  const fixtureTexture = device.createTexture({
    label: 'galaxy:ismMapDustCdfScanFixture',
    size: [FIXTURE_AZ, FIXTURE_RINGS],
    format: 'rgba32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: fixtureTexture },
    fixtureData.buffer,
    { bytesPerRow: FIXTURE_AZ * 16 },
    { width: FIXTURE_AZ, height: FIXTURE_RINGS },
  );

  const scan = createIsmMapDustCdfScan(device, {
    makeShader: deps.makeShader,
    maxRings: FIXTURE_RINGS,
    maxAz: FIXTURE_AZ,
  });

  // The SAME `ismMapRingMeans` production function the probe's own CPU
  // reference calls — computed once here (not re-derived per dispatch,
  // this fixture never changes) and uploaded, so the GPU scan's
  // ring-normalised branch has real ring means to read, not zeros.
  const fixtureMap: GalaxyIsmMap = { ...grid, data: fixtureData };
  const ringMeans = ismMapRingMeans(fixtureMap, (texel) => texel.dust);
  const ringMeansBuffer = device.createBuffer({
    label: 'galaxy:ismMapDustCdfScanDebugRingMeans',
    size: FIXTURE_RINGS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ringMeansBuffer, 0, Float32Array.from(ringMeans));

  const byteSize = FIXTURE_RINGS * FIXTURE_AZ * 4;
  const readbackBuffer = device.createBuffer({
    label: 'galaxy:ismMapDustCdfScanDebugReadback',
    size: byteSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  // Debug-only, single caller (the probe) — same bare boolean guard
  // `createArmRidgeDebugSample.ts` uses to turn an accidental double-call
  // into a clear error rather than mapAsync's own 'already mapped' one.
  let inFlight = false;

  return {
    async dispatchAndReadback() {
      if (inFlight) throw new Error('ismMapDustCdfScanDebugSample: readback already in flight');
      inFlight = true;
      try {
        const enc = device.createCommandEncoder({ label: 'galaxy:ismMapDustCdfScanDebugSample' });
        scan.dispatchScan(enc, {
          ismMapTexture: fixtureTexture,
          grid,
          weights: {
            kind: 'channel',
            channelWeights: { gas: 0, stars: 0, activity: 0, dust: 1 },
            ringCap: DEBUG_RING_CAP,
          },
          ringMeansBuffer,
        });
        enc.copyBufferToBuffer(scan.prefixBuffer, 0, readbackBuffer, 0, byteSize);
        device.queue.submit([enc.finish()]);

        await readbackBuffer.mapAsync(GPUMapMode.READ);
        let prefix: number[];
        try {
          prefix = Array.from(new Float32Array(readbackBuffer.getMappedRange().slice(0)));
        } finally {
          readbackBuffer.unmap();
        }
        return { grid, data: Array.from(fixtureData), prefix, ringCap: DEBUG_RING_CAP };
      } finally {
        inFlight = false;
      }
    },
    dispose(): void {
      scan.dispose();
      fixtureTexture.destroy();
      ringMeansBuffer.destroy();
      readbackBuffer.destroy();
    },
  };
}
