import type { NavAxis } from '../../@types/camera/input/NavAxis';
import type { NavIntent } from '../../@types/input/NavIntent';

export const NAV_INTENT_AXIS: Readonly<Record<NavIntent, NavAxis>> = {
  navOrbit: 'orbit',
  navLook: 'look',
  navRoll: 'roll',
  navZoom: 'zoom',
};
