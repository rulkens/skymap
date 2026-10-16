import type { DeviceEvent } from './DeviceEvent';

/** The pointer half of `DeviceEvent`: the events that carry a pointer id, button and position. */
export type PointerDeviceEvent = Extract<DeviceEvent, { kind: 'down' | 'move' | 'up' | 'cancel' }>;
