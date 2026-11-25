import type { GpuBufferZone } from './GpuBufferZone';

/** The sim's memory against the device limit, as the Stats meter shows it. */
export type GpuBufferReading = {
  /** 0–1, the bar's fill; clamped at full when the memory is over the limit. */
  readonly fill: number;
  readonly zone: GpuBufferZone;
};
