/**
 * HEADLIGHT_CEIL — the soft ceiling on the headlight gain h = D^k, folded as h / (1 + h / CEIL).
 * The forward Doppler factor passes a million on the far trips; uncapped, the tone map sees a
 * white wall within a few ship-years. A starting value, tuned by eye.
 */
export const HEADLIGHT_CEIL = 64;
