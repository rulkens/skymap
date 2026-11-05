import type { RemoteNavAxis } from '../../@types/remote/RemoteNavAxis';

export const AXIS_HINTS: Record<RemoteNavAxis, string> = {
  orbit: 'Drag to orbit, pinch to zoom',
  look: 'Drag to look around, pinch to zoom',
  roll: 'Drag sideways to roll, pinch to zoom',
  zoom: 'Drag up or down to zoom',
};
