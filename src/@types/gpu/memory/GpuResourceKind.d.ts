/** Which `device.create*` call produced a tracked resource — `trackGpuMemory`
 *  tallies bytes per (kind, owner), so an owner using both (e.g.
 *  `volumeFieldRenderer`) gets two rows instead of one merged total. */
export type GpuResourceKind = 'buffer' | 'texture';
