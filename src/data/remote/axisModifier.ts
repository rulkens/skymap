import type { Modifiers } from '../../@types/input/Modifiers';
import type { RemoteNavAxis } from '../../@types/remote/RemoteNavAxis';

const NONE: Modifiers = { shift: false, ctrl: false, alt: false, meta: false };

/** A touch has no keyboard, so the axis is carried as the modifier OpenSpace's bindings already read. */
export const AXIS_MODIFIER: Record<RemoteNavAxis, Modifiers> = {
  orbit: NONE,
  look: { ...NONE, ctrl: true },
  roll: { ...NONE, shift: true },
  zoom: { ...NONE, alt: true },
};
