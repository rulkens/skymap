/**
 * ismMapStepIndexData — per-step index array for rebuildIsmMap's uniform
 * buffer, one float per device-aligned slot: writeBuffer calls apply in
 * ISSUE order before rebuildIsmMap's single submit, so one rewritten slot
 * would let every step read only the last write (see rebuildIsmMap's
 * docblock in createGalaxyModel.ts). `strideBytes` is
 * device.limits.minUniformBufferOffsetAlignment — never assume 256.
 */
export function ismMapStepIndexData(steps: number, strideBytes: number): Float32Array {
  const strideFloats = strideBytes / 4;
  const stepData = new Float32Array(steps * strideFloats);
  for (let s = 0; s < steps; s++) stepData[s * strideFloats] = s;
  return stepData;
}
