import type { NavIntent } from './NavIntent';

/** What a held press drives; `tilt` is the two-finger drag, which no press binds. */
export type HeldIntent = 'orbit' | 'pan' | 'tilt' | NavIntent;
