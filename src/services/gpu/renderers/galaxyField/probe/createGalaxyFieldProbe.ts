/**
 * createGalaxyFieldProbe — the analytic field's debug-only readback surface,
 * driven by the host's GPU-error probe. Every placement readback RE-dispatches
 * from scratch, so it cannot see what the live `place:*` stages left in the
 * buffers; `peekRecords` is the counterpart that copies the slots as they
 * currently stand without dispatching anything.
 */

import type { GalaxyFieldProbe } from '../../../../../@types/galaxy/GalaxyFieldProbe';
import type { GalaxyFieldStageContext } from '../../../../../@types/galaxy/GalaxyFieldStageContext';
import type { FieldBindGroups } from '../field/createFieldPipelines';
import { findHiiSegment } from '../field/findHiiSegment';
import { FIELD_COMPONENT_FLOATS } from '../field/packFieldUniforms';
import { buildArmCloudDispatchInput } from '../stages/buildArmCloudDispatchInput';
import { buildDigDispatchInput } from '../stages/buildDigDispatchInput';
import { buildDustDispatchInput } from '../stages/buildDustDispatchInput';
import { buildSpurCloudDispatchInput } from '../stages/buildSpurCloudDispatchInput';

export function createGalaxyFieldProbe(deps: {
  readonly ctx: () => GalaxyFieldStageContext;
  readonly peekScratchBuffer: GPUBuffer;
  readonly fieldSplatPipe: GPURenderPipeline;
  readonly bindGroups: () => FieldBindGroups | null;
}): GalaxyFieldProbe {
  const { ctx, peekScratchBuffer, fieldSplatPipe, bindGroups } = deps;

  return {
    async peekRecords(
      buffer: 'field' | 'hii',
      offset: number,
      count: number,
    ): Promise<Float32Array> {
      if (count <= 0) return new Float32Array(0);
      const { device, fieldComps, hiiComps } = ctx();
      const source = buffer === 'field' ? fieldComps.getBuffer() : hiiComps.getBuffer();
      const byteSize = count * FIELD_COMPONENT_FLOATS * 4;
      const byteOffset = offset * FIELD_COMPONENT_FLOATS * 4;
      const enc = device.createCommandEncoder({ label: 'galaxy:peekRecords' });
      enc.copyBufferToBuffer(source, byteOffset, peekScratchBuffer, 0, byteSize);
      device.queue.submit([enc.finish()]);
      await peekScratchBuffer.mapAsync(GPUMapMode.READ, 0, byteSize);
      try {
        return new Float32Array(peekScratchBuffer.getMappedRange(0, byteSize).slice(0));
      } finally {
        peekScratchBuffer.unmap();
      }
    },

    async requestDustPlacementReadback(opts) {
      const c = ctx();
      const budget = c.model.dustBudget.get();
      if (!c.input.geometry || !budget) return null;
      const { placeDust, ringReduce } = c.chain;
      const { records, mass } = await placeDust.dispatchAndReadbackDust(
        buildDustDispatchInput(c, c.input.geometry, budget, opts?.forceGeneratorIsFluid),
      );
      // Own encoder/submit, AFTER the placement dispatch above's submit has
      // already retired — `placeDust.massBuffer` holds THIS dispatch's
      // fresh values with nothing else writing to it in between, so this
      // reduction is over the same records the caller just read back.
      const enc = c.device.createCommandEncoder({ label: 'galaxy:placeDustDebugSurvivorSum' });
      ringReduce.dispatchSurvivorSum(enc, {
        massBuffer: placeDust.massBuffer,
        count: budget.count,
        totalMass: budget.totalMass,
      });
      c.device.queue.submit([enc.finish()]);
      const renormScale = await ringReduce.readDustRenormScale();
      return { count: budget.count, records, mass, renormScale };
    },

    async requestArmSpurCloudPlacementReadback() {
      const c = ctx();
      const reservation = c.model.centralField.get().spurCloudReservation;
      if (!c.input.geometry || !reservation) return null;
      const { placeArmSpurCloud, ringReduce } = c.chain;
      const { records, fluxWeight } = await placeArmSpurCloud.dispatchAndReadbackArmSpurCloud(
        buildSpurCloudDispatchInput(c, c.input.geometry, reservation),
      );
      const enc = c.device.createCommandEncoder({
        label: 'galaxy:placeArmSpurCloudDebugFluxWeightSum',
      });
      ringReduce.dispatchArmSpurFluxWeightSum(enc, {
        fluxWeightBuffer: placeArmSpurCloud.fluxWeightBuffer,
        count: reservation.count,
      });
      c.device.queue.submit([enc.finish()]);
      const renormScale = await ringReduce.readArmSpurRenormScale();
      return {
        count: reservation.count,
        offset: reservation.offset,
        flux: reservation.flux,
        records,
        fluxWeight,
        renormScale,
      };
    },

    async requestArmCloudPlacementReadback() {
      const c = ctx();
      const reservation = c.model.centralField.get().armCloudReservation;
      if (!c.input.geometry || !reservation) return null;
      const { placeArmCloud, ringReduce } = c.chain;
      const { records, fluxWeight } = await placeArmCloud.dispatchAndReadbackArmCloud(
        buildArmCloudDispatchInput(c, c.input.geometry, reservation),
      );
      const enc = c.device.createCommandEncoder({
        label: 'galaxy:placeArmCloudDebugFluxWeightSum',
      });
      ringReduce.dispatchArmCloudFluxWeightSum(enc, {
        fluxWeightBuffer: placeArmCloud.fluxWeightBuffer,
        count: reservation.count,
      });
      c.device.queue.submit([enc.finish()]);
      const renormScale = await ringReduce.readArmCloudRenormScale();
      return {
        count: reservation.count,
        offset: reservation.offset,
        flux: reservation.flux,
        records,
        fluxWeight,
        renormScale,
      };
    },

    async requestDigVeilPlacementReadback() {
      const c = ctx();
      const budget = c.model.digBudget.get();
      if (!c.input.geometry || !budget) return null;
      const records = await c.chain.placeDigVeil.dispatchAndReadbackDigVeil(
        buildDigDispatchInput(c, c.input.geometry, budget),
      );
      return {
        count: budget.count,
        offset: findHiiSegment(c.model.hiiPack.get().segments, 'hii:dig')?.first ?? 0,
        amplitudeBase: budget.amplitudeBase,
        records,
      };
    },

    fieldSplatPipe,
    get fieldSplatBG(): GPUBindGroup | null {
      return bindGroups()?.fieldSplat ?? null;
    },
  };
}
