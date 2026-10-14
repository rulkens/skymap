import type { StellarStreamsLook } from '../../layers/stellarStreams/@types/StellarStreamsLook';

/** Sharp streaks, then a wide faint haze that gives each stream a glowing body. */
export const STELLAR_STREAMS_LOOKS: readonly [StellarStreamsLook, StellarStreamsLook] = [
  { intensity: 0.35, sizeScale: 0.35, stretch: 2.5, minPx: 0.9, flow: 1 },
  { intensity: 0.04, sizeScale: 4.0, stretch: 0, minPx: 2.0, flow: 0 },
];
