import { AXIS_MODIFIER } from '../../data/remote/axisModifier';
import type { DeviceEvent } from '../../@types/input/DeviceEvent';
import type { RemoteNavAxis } from '../../@types/remote/RemoteNavAxis';

/** Only the press is bound to an intent, so only `down` needs the modifier. */
export function stampAxisMods(event: DeviceEvent, axis: RemoteNavAxis): DeviceEvent {
  return event.kind === 'down' ? { ...event, mods: AXIS_MODIFIER[axis] } : event;
}
