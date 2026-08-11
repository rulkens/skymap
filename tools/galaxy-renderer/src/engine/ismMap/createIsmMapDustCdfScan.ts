/**
 * createIsmMapDustCdfScan — GPU replacement for `buildIsmMapDustCdf.ts`'s
 * CPU prefix sum (`ismMapDustCdfScan.wesl`'s own header has the pass
 * structure). Built once against a fixed `maxRings`/`maxAz` ceiling —
 * `dispatchScan` rebuilds its bind groups per call (grid size and the
 * weight table both vary call to call: a fixture-sized probe grid today,
 * Tasks 7/8's real `ISM_MAP_RINGS x ISM_MAP_AZ` grid once they land), same
 * "small, infrequent, rebuild the bind group" discipline `createFieldPipelines`'s
 * rebuild-on-change bind groups already use elsewhere in this tree.
 */
import ismMapDustCdfScanWgsl from '../shaders/milkyWay/ismMap/ismMapDustCdfScan.wesl?static';

import { packIsmMapCdfParams, ISM_MAP_CDF_PARAMS_BUFFER_SIZE } from './packIsmMapCdfParams';
import type { IsmMapCdfChannelWeights } from './packIsmMapCdfParams';
import {
  packIsmMapCdfArmEnvelope,
  ISM_MAP_CDF_ARM_ENVELOPE_FLOATS_PER_ENTRY,
} from './packIsmMapCdfArmEnvelope';
import type { IsmMapCdfArmEnvelopeEntry } from './packIsmMapCdfArmEnvelope';

export type { IsmMapCdfChannelWeights, IsmMapCdfArmEnvelopeEntry };

/** Headroom over any real preset's arm count (hiiRegions.ts callers run well under this) — just sizes the fixed armEnvelopeBuffer allocation. */
export const ISM_MAP_CDF_MAX_ARM_COUNT = 8;

export type IsmMapCdfScanGrid = {
  readonly rings: number;
  readonly az: number;
  readonly rMin: number;
  readonly rMax: number;
};

/**
 * 'channel': dust density for `placeDust` (Task 7) — the per-texel channel
 * dot, ring-mean-normalised and optionally capped by `ringCap`
 * (`dustParticleCloud.ts`'s `density()` closure, :208-218 — `cloud.
 * dustPlacementCap`, `<=0`/omitted is that field's own "uncapped"
 * convention). 'armBiased': `placeDigVeil` (Task 8) — the bare channel dot
 * (no ring normalisation), reweighted toward `entries`' packed ridge
 * envelope (`buildArmProximityEnvelope`/`armBiasedDensity`,
 * `hiiRegions.ts:484-539`). `entries` is ring-major, length `rings *
 * armCount` — see `packIsmMapCdfArmEnvelope.ts`'s own doc for how a caller
 * fills it (one `refresh(radius)` per ring, not per texel).
 */
export type IsmMapCdfWeightTable =
  | {
      readonly kind: 'channel';
      readonly channelWeights: IsmMapCdfChannelWeights;
      readonly ringCap?: number;
    }
  | {
      readonly kind: 'armBiased';
      readonly channelWeights: IsmMapCdfChannelWeights;
      readonly armBias: number;
      readonly armCount: number;
      readonly entries: readonly IsmMapCdfArmEnvelopeEntry[];
    };

export type IsmMapDustCdfScan = {
  /** `grid.rings * grid.az` floats after `dispatchScan` — the running mass through each texel, `buildIsmMapDustCdf.ts`'s own `prefix` array. Sized to `maxRings * maxAz`; only the leading `grid.rings * grid.az` floats are meaningful after a call with a smaller grid. */
  readonly prefixBuffer: GPUBuffer;
  /** Encode all three passes into the CALLER's encoder — one compute pass, WebGPU's own cross-dispatch storage-buffer sync (see `createIsmMapFluidRunner.ts`'s own doc) makes a pass split unnecessary. */
  dispatchScan(
    enc: GPUCommandEncoder,
    params: {
      readonly ismMapTexture: GPUTexture;
      readonly grid: IsmMapCdfScanGrid;
      readonly weights: IsmMapCdfWeightTable;
      /** ringReduce.wesl's per-ring dust means (ismMapGenerator.ringMeansBuffer) — always bound, whether the active weight table's own branch reads it or not (evalWeight's static reference — see ismMapDustCdfScan.wesl's own doc). */
      readonly ringMeansBuffer: GPUBuffer;
    },
  ): void;
  dispose(): void;
};

export function createIsmMapDustCdfScan(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly maxRings: number;
    readonly maxAz: number;
  },
): IsmMapDustCdfScan {
  const { maxRings, maxAz } = deps;
  const mod = deps.makeShader(ismMapDustCdfScanWgsl, 'galaxy:ismMapDustCdfScan');

  const ringScanPipe = device.createComputePipeline({
    label: 'galaxy:ismMapDustCdfScanRingScanPipe',
    layout: 'auto',
    compute: { module: mod, entryPoint: 'csRingScan' },
  });
  const foldPipe = device.createComputePipeline({
    label: 'galaxy:ismMapDustCdfScanFoldPipe',
    layout: 'auto',
    compute: { module: mod, entryPoint: 'csFoldRingOffsets' },
  });
  const applyPipe = device.createComputePipeline({
    label: 'galaxy:ismMapDustCdfScanApplyPipe',
    layout: 'auto',
    compute: { module: mod, entryPoint: 'csApplyRingOffsets' },
  });

  const paramsBuffer = device.createBuffer({
    label: 'galaxy:ismMapDustCdfScanParams',
    size: ISM_MAP_CDF_PARAMS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const prefixBuffer = device.createBuffer({
    label: 'galaxy:ismMapDustCdfScanPrefix',
    size: maxRings * maxAz * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const ringTotalsBuffer = device.createBuffer({
    label: 'galaxy:ismMapDustCdfScanRingTotals',
    size: maxRings * 4,
    usage: GPUBufferUsage.STORAGE,
  });
  const armEnvelopeBuffer = device.createBuffer({
    label: 'galaxy:ismMapDustCdfScanArmEnvelope',
    size: maxRings * ISM_MAP_CDF_MAX_ARM_COUNT * ISM_MAP_CDF_ARM_ENVELOPE_FLOATS_PER_ENTRY * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  // 'channel' mode (armCount=0) never reads this, but csRingScan's shader
  // body still STATICALLY references armEnvelopeBuf inside evalWeight, so
  // its 'auto' layout always expects binding 2 bound to something.
  const dummyArmEnvelopeBuffer = device.createBuffer({
    label: 'galaxy:ismMapDustCdfScanArmEnvelopeDummy',
    size: ISM_MAP_CDF_ARM_ENVELOPE_FLOATS_PER_ENTRY * 4,
    usage: GPUBufferUsage.STORAGE,
  });

  return {
    prefixBuffer,

    dispatchScan(enc, { ismMapTexture, grid, weights, ringMeansBuffer }): void {
      if (grid.rings > maxRings || grid.az > maxAz) {
        throw new Error(
          `ismMapDustCdfScan: grid ${grid.rings}x${grid.az} exceeds the ${maxRings}x${maxAz} ceiling this instance was built for`,
        );
      }
      const armBiased = weights.kind === 'armBiased';
      device.queue.writeBuffer(
        paramsBuffer,
        0,
        packIsmMapCdfParams({
          rMin: grid.rMin,
          rMax: grid.rMax,
          rings: grid.rings,
          az: grid.az,
          channelWeights: weights.channelWeights,
          armBias: armBiased ? weights.armBias : 0,
          armCount: armBiased ? weights.armCount : 0,
          cap: armBiased ? 0 : (weights.ringCap ?? 0),
        }),
      );
      if (armBiased) {
        if (weights.entries.length !== grid.rings * weights.armCount) {
          throw new Error(
            `ismMapDustCdfScan: armBiased entries.length ${weights.entries.length} !== rings*armCount ${grid.rings * weights.armCount}`,
          );
        }
        device.queue.writeBuffer(armEnvelopeBuffer, 0, packIsmMapCdfArmEnvelope(weights.entries));
      }

      const ringScanBindGroup = device.createBindGroup({
        label: 'galaxy:ismMapDustCdfScanRingScanBG',
        layout: ringScanPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: ismMapTexture.createView() },
          { binding: 1, resource: { buffer: paramsBuffer } },
          {
            binding: 2,
            resource: { buffer: armBiased ? armEnvelopeBuffer : dummyArmEnvelopeBuffer },
          },
          { binding: 3, resource: { buffer: prefixBuffer } },
          { binding: 4, resource: { buffer: ringTotalsBuffer } },
          { binding: 5, resource: { buffer: ringMeansBuffer } },
        ],
      });
      const foldBindGroup = device.createBindGroup({
        label: 'galaxy:ismMapDustCdfScanFoldBG',
        layout: foldPipe.getBindGroupLayout(0),
        entries: [
          { binding: 1, resource: { buffer: paramsBuffer } },
          { binding: 4, resource: { buffer: ringTotalsBuffer } },
        ],
      });
      const applyBindGroup = device.createBindGroup({
        label: 'galaxy:ismMapDustCdfScanApplyBG',
        layout: applyPipe.getBindGroupLayout(0),
        entries: [
          { binding: 1, resource: { buffer: paramsBuffer } },
          { binding: 3, resource: { buffer: prefixBuffer } },
          { binding: 4, resource: { buffer: ringTotalsBuffer } },
        ],
      });

      const pass = enc.beginComputePass({ label: 'galaxy:ismMapDustCdfScanPass' });
      pass.setPipeline(ringScanPipe);
      pass.setBindGroup(0, ringScanBindGroup);
      pass.dispatchWorkgroups(1, grid.rings, 1);

      pass.setPipeline(foldPipe);
      pass.setBindGroup(0, foldBindGroup);
      pass.dispatchWorkgroups(1, 1, 1);

      pass.setPipeline(applyPipe);
      pass.setBindGroup(0, applyBindGroup);
      pass.dispatchWorkgroups(Math.ceil(grid.az / 16), Math.ceil(grid.rings / 16), 1);
      pass.end();
    },

    dispose(): void {
      paramsBuffer.destroy();
      prefixBuffer.destroy();
      ringTotalsBuffer.destroy();
      armEnvelopeBuffer.destroy();
      dummyArmEnvelopeBuffer.destroy();
    },
  };
}
