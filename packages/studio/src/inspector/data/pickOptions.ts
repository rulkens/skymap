/** The options of the two pick controls: every ease the engine has, and every channel a step can write. */
import { EASE } from '../../../../../src/services/engine/animation/ease';
import type { Channel } from '../../../../../src/@types/animation/Channel';
import type { Ease } from '../../../../../src/@types/animation/Ease';
import type { PickOption } from '../@types/PickOption';

// Keyed by Channel so a new channel fails to compile here; the engine has no runtime list of them.
const CHANNEL_TEXT: Record<Channel, string> = {
  distance: 'Distance',
  yaw: 'Turn',
  pitch: 'Tilt',
  roll: 'Roll',
  fov: 'FOV',
  target: 'Look-at',
};

export const PICK_OPTIONS: {
  readonly ease: readonly PickOption[];
  readonly channel: readonly PickOption[];
} = {
  ease: (Object.keys(EASE) as Ease[]).map((value) => ({ value, text: value })),
  channel: (Object.entries(CHANNEL_TEXT) as [Channel, string][]).map(([value, text]) => ({
    value,
    text,
  })),
};
