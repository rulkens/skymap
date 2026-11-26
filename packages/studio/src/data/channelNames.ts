/** Each channel's Name in the naming table: the Name of a step that sets it, and the Channel readout. */
import type { Channel } from '../../../../src/@types/animation/Channel';

export const CHANNEL_NAME: Record<Channel, string> = {
  distance: 'Distance',
  yaw: 'Turn',
  pitch: 'Tilt',
  roll: 'Roll',
  fov: 'FOV',
  target: 'Look-at',
};
