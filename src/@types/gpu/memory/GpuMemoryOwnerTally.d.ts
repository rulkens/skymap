/** `trackGpuMemory`'s live per-owner accumulator — `GpuMemoryOwnerRow` minus
 *  the `owner` key, which the Map this lives in already carries as its key. */
export type GpuMemoryOwnerTally = {
  bytes: number;
  count: number;
  gcReclaimed: number;
};
