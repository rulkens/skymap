import type { GpuBufferZone } from './GpuBufferZone';

/** A grid buffer against the device limit, as the Stats meter shows it. */
export type GpuBufferReading = {
  /** 0–1, the bar's fill; clamped, unlike `percent`. */
  readonly fill: number;
  /** Whole percent, rounded down so the number never shows a zone it has not reached. */
  readonly percent: number;
  readonly zone: GpuBufferZone;
};
