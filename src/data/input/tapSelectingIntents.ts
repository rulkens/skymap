import type { HeldIntent } from '../../@types/input/HeldIntent';

/** The presses whose tap picks and whose double-tap focuses; every other held press is a camera drag only. */
export const TAP_SELECTING_INTENTS: ReadonlySet<HeldIntent> = new Set(['orbit', 'navOrbit']);
