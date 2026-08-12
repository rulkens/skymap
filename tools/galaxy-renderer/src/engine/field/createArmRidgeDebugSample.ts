/**
 * createArmRidgeDebugSample — debug-only GPU dispatch, armRidge.wesl's own
 * numeric-validation exception: it has no non-GPU path to check
 * its output against, so `probeGpuErrors.ts` runs armRidgeDebugSample.wesl's
 * `csSample` over its own hard-coded fixtures and diffs the result against
 * armRidgeGeometry.ts's CPU output at the SAME literal values (mirrored in
 * the probe step, not read back from the shader). No production caller —
 * same shape as `createIsmMapRingReduce.ts`'s ringMeans check, minus the
 * shared readback queue: this dispatch has no persistent source buffer
 * another stream could race, so a plain one-shot map/unmap suffices.
 */
import armRidgeDebugSampleWgsl from '../shaders/milkyWay/field/armRidgeDebugSample.wesl?static';

/** Mirrors armRidgeDebugSample.wesl's own SAMPLE_COUNT/FLOATS_PER_SAMPLE — see that file for the fixture values this shape reads back. */
export const ARM_RIDGE_DEBUG_SAMPLE_COUNT = 4;
export const ARM_RIDGE_DEBUG_FLOATS_PER_SAMPLE = 19;

export type ArmRidgeDebugSample = {
  /** Dispatch csSample and map its output buffer back to the CPU. Rejects on a mapAsync failure rather than hanging, same contract as `requestRingMeansReadback`. */
  dispatchAndReadback(): Promise<Float32Array>;
  dispose(): void;
};

export function createArmRidgeDebugSample(
  device: GPUDevice,
  deps: { readonly makeShader: (code: string, label: string) => GPUShaderModule },
): ArmRidgeDebugSample {
  const byteSize = ARM_RIDGE_DEBUG_SAMPLE_COUNT * ARM_RIDGE_DEBUG_FLOATS_PER_SAMPLE * 4;

  const mod = deps.makeShader(armRidgeDebugSampleWgsl, 'galaxy:armRidgeDebugSample');
  const outBuffer = device.createBuffer({
    label: 'galaxy:armRidgeDebugSampleOut',
    size: byteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readbackBuffer = device.createBuffer({
    label: 'galaxy:armRidgeDebugSampleReadback',
    size: byteSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const pipeline = device.createComputePipeline({
    label: 'galaxy:armRidgeDebugSamplePipe',
    layout: 'auto',
    compute: { module: mod, entryPoint: 'csSample' },
  });
  const bindGroup = device.createBindGroup({
    label: 'galaxy:armRidgeDebugSampleBG',
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: outBuffer } }],
  });

  // Debug-only, single caller (the probe) — a bare boolean guard is enough to
  // turn an accidental double-call into a clear error rather than the
  // 'buffer already mapped' one mapAsync would throw instead.
  let inFlight = false;

  return {
    async dispatchAndReadback(): Promise<Float32Array> {
      if (inFlight) throw new Error('armRidgeDebugSample: readback already in flight');
      inFlight = true;
      try {
        const enc = device.createCommandEncoder({ label: 'galaxy:armRidgeDebugSample' });
        const pass = enc.beginComputePass({ label: 'galaxy:armRidgeDebugSamplePass' });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(ARM_RIDGE_DEBUG_SAMPLE_COUNT);
        pass.end();
        enc.copyBufferToBuffer(outBuffer, 0, readbackBuffer, 0, byteSize);
        device.queue.submit([enc.finish()]);

        await readbackBuffer.mapAsync(GPUMapMode.READ);
        try {
          return new Float32Array(readbackBuffer.getMappedRange().slice(0));
        } finally {
          readbackBuffer.unmap();
        }
      } finally {
        inFlight = false;
      }
    },
    dispose(): void {
      outBuffer.destroy();
      readbackBuffer.destroy();
    },
  };
}
