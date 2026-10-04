/**
 * The OpenSpace press binding, in the branch order of v0.22.0's
 * `mousecamerastates.cpp`: alt wins over shift, shift over ctrl. A touch or
 * pen press always orbits, so every gesture in the scheme rides the navigator.
 */
import type { AxisPress } from '../../@types/camera/AxisPress';
import type { NavAxis } from '../../@types/camera/NavAxis';

const MIDDLE_BUTTON = 1;
const RIGHT_BUTTON = 2;

export function openSpaceAxisFor(press: AxisPress): NavAxis {
  if (press.pointerType !== 'mouse') return 'orbit';
  if (press.button === RIGHT_BUTTON) return 'zoom';
  if (press.button === MIDDLE_BUTTON) return 'roll';
  if (press.alt) return 'zoom';
  if (press.shift) return 'roll';
  if (press.ctrl) return 'look';
  return 'orbit';
}
