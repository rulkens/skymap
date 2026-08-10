/**
 * ISM_MAP_AMBIENT_DUST mirrors ismMapAutomatonStep.wesl's (and
 * ismMapFluidStep.wesl's) step-0 seed, and is also what every GPU consumer of
 * the swept channel (ismMapDustBlur.wesl, dustDetail.wesl, ismMapPresent.wesl)
 * subtracts off — all five WESL mirrors are parity-tested against this
 * export in constants.parity.test.ts.
 */

/** Ambient dust pedestal's MAXIMUM, and the fixed overshoot reference every consumer subtracts (ismMapAutomatonStep.wesl, ismMapFluidStep.wesl). The automaton seeds every texel to exactly this; the fluid generator seeds ISM_MAP_AMBIENT_DUST * gasProfile(r) (<= this, gasProfile's own max is 1), so only the automaton stays uniformly AT the pedestal. */
export const ISM_MAP_AMBIENT_DUST = 1.0;
