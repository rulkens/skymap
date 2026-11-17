import type { StellarStreamsLook } from '../streaks/@types/StellarStreamsLook';

/** The streams' switch, their captions' switch, and the two draws' looks (DebugPanel knobs). */
export type StellarStreamsSettings = {
  enabled: boolean;
  labelEnabled: boolean;
  streak: StellarStreamsLook;
  haze: StellarStreamsLook;
};
