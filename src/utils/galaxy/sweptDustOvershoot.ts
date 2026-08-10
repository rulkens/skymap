/**
 * ISM_MAP_AMBIENT_DUST mirrors ismMapFluidStep.wesl's step-0 seed, and is
 * also what every GPU consumer of the swept channel (ismMapDustBlur.wesl,
 * dustDetail.wesl, ismMapPresent.wesl) subtracts off — the WESL mirrors are
 * parity-tested against this export in constants.parity.test.ts.
 */

/** Ambient dust pedestal's MAXIMUM, and the fixed overshoot reference every consumer subtracts (ismMapFluidStep.wesl). The generator seeds ISM_MAP_AMBIENT_DUST * gasProfile(r) (<= this, gasProfile's own max is 1), so it stays uniformly AT the pedestal only where gasProfile is 1. */
export const ISM_MAP_AMBIENT_DUST = 1.0;
