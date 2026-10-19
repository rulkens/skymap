/**
 * STAR_TINT_BLACKBODY_ANCHORS — the star tint ramp's five anchors (the BP−RP breakpoints of
 * `starCatalog/tint.wesl`'s `starTint`) paired with a blackbody temperature each, O/B to M.
 * `boostedBpRp` reads log T piecewise-linear in BP−RP through it; `lib/boost.wesl` mirrors it as
 * `ANCHOR_*` constants and a parity test pins both halves to the ramp. Class-centre values,
 * not a photometric calibration.
 */
export const STAR_TINT_BLACKBODY_ANCHORS = [
  { bpRp: -0.3, temperatureK: 30_000 },
  { bpRp: 0.3, temperatureK: 7_500 },
  { bpRp: 0.85, temperatureK: 5_800 },
  { bpRp: 1.25, temperatureK: 4_500 },
  { bpRp: 2.2, temperatureK: 3_500 },
] as const;
