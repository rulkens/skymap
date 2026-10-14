import type { StellarStreamsLook } from '../../layers/stellarStreams/@types/StellarStreamsLook';

/** Sharp streaks, then a wide faint haze that gives each stream a glowing body. */
export const STELLAR_STREAMS_LOOKS: readonly [StellarStreamsLook, StellarStreamsLook] = [
  { intensity: 0.09, sizeScale: 0.28, stretch: 5, minPx: 0.8, flow: 0 },
  { intensity: 0.005, sizeScale: 1.4, stretch: 0.5, minPx: 1.5, flow: 0 },
];
