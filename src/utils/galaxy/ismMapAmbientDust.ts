/**
 * ISM_MAP_AMBIENT_DUST mirrors ismMapFluidStep.wesl's step-0 seed
 * (`ambient * gasProfile(r)`); ismMapDustBlur.wesl and
 * ismMapCartesianBake.wesl subtract it back off before using the swept
 * channel as placement density. The WESL mirrors are parity-tested against
 * this export in constants.parity.test.ts.
 */

/**
 * Ambient dust pedestal's MAXIMUM, and the fixed overshoot reference the
 * subtractors above use. Since `gasProfile`'s own max is 1, the seed
 * (`ISM_MAP_AMBIENT_DUST * gasProfile(r)`) sits uniformly AT this pedestal
 * only where gasProfile is 1.
 */
export const ISM_MAP_AMBIENT_DUST = 1.0;
