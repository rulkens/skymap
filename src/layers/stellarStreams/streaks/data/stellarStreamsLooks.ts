import type { StellarStreamsLook } from '../@types/StellarStreamsLook';

/** Sharp streaks, then a wide faint haze that gives each stream a glowing body; `flow` is kpc per 8 s loop. */
export const STELLAR_STREAMS_LOOKS = {
  streak: { intensity: 0.09, sizeScale: 0.28, stretch: 5, minPx: 0.8, flow: 4 },
  haze: { intensity: 0.005, sizeScale: 1.4, stretch: 0.5, minPx: 1.5, flow: 0 },
} as const satisfies Record<'streak' | 'haze', StellarStreamsLook>;
