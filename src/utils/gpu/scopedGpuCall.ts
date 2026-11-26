/**
 * Runs `call` synchronously inside a validation and an out-of-memory error scope and pops both
 * before returning; the promise rejects with the first error. Never hold a scope across an await:
 * scopes belong to the device and would catch the render loop's errors from frames in between.
 */
export function scopedGpuCall(device: GPUDevice, call: () => void): Promise<void> {
  device.pushErrorScope('validation');
  device.pushErrorScope('out-of-memory');
  let thrown: unknown;
  try {
    call();
  } catch (error) {
    thrown = error;
  }
  const outOfMemory = device.popErrorScope();
  const validation = device.popErrorScope();
  return Promise.all([validation, outOfMemory]).then(([v, o]) => {
    if (thrown !== undefined) throw thrown;
    const error = v ?? o;
    if (error) throw new Error(`GPU error: ${error.message}`);
  });
}
