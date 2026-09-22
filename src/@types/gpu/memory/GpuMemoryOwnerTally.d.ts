/** `trackGpuMemory`'s live per-(owner, kind) accumulator — `GpuMemoryOwnerRow`
 *  minus `owner` and `kind`, which the ledger's nested Map already carries
 *  as its keys. */
export type GpuMemoryOwnerTally = {
  bytes: number;
  count: number;
  gcReclaimed: number;
};
