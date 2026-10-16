import { describe, expect, it } from 'vitest';

import { parseDeviceEvent } from '../../../src/utils/remote/parseDeviceEvent';
import type { DeviceEvent } from '../../../src/@types/input/DeviceEvent';

const mods = { shift: false, ctrl: true, alt: false, meta: false };
const down: DeviceEvent = {
  kind: 'down',
  t: 12.5,
  pointer: 3,
  pointerType: 'touch',
  button: 0,
  at: { x: 0.25, y: 1 },
  mods,
};

describe('parseDeviceEvent', () => {
  it('every DeviceEvent arm round-trips through JSON', () => {
    const arms: DeviceEvent[] = [
      down,
      { ...down, kind: 'move', pointerType: 'mouse', button: 2 },
      { ...down, kind: 'up', pointerType: 'pen', button: 1 },
      { ...down, kind: 'cancel' },
      { kind: 'wheel', t: 4, ratio: 1.08, at: { x: 0, y: 0.5 }, mods },
      { kind: 'leave', t: 5 },
      { kind: 'resize', t: 6, widthPx: 390, heightPx: 844 },
    ];
    for (const e of arms) expect(parseDeviceEvent(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });

  it('drops an unknown kind', () => {
    expect(parseDeviceEvent({ ...down, kind: 'tap' })).toBeNull();
  });

  it('drops a non-finite number', () => {
    expect(parseDeviceEvent({ ...down, t: NaN })).toBeNull();
    expect(
      parseDeviceEvent({ kind: 'wheel', t: 1, ratio: Infinity, at: down.at, mods }),
    ).toBeNull();
    expect(parseDeviceEvent({ kind: 'resize', t: 1, widthPx: NaN, heightPx: 100 })).toBeNull();
  });

  it('drops an at outside 0..1', () => {
    expect(parseDeviceEvent({ ...down, at: { x: 1.01, y: 0.5 } })).toBeNull();
    expect(parseDeviceEvent({ ...down, at: { x: 0.5, y: -0.01 } })).toBeNull();
  });

  it('drops a zero or huge size', () => {
    expect(parseDeviceEvent({ kind: 'resize', t: 1, widthPx: 0, heightPx: 100 })).toBeNull();
    expect(parseDeviceEvent({ kind: 'resize', t: 1, widthPx: 100, heightPx: 16385 })).toBeNull();
  });

  it('drops extra fields from the result', () => {
    const parsed = parseDeviceEvent({
      ...down,
      extra: 1,
      at: { ...down.at, z: 2 },
      mods: { ...mods, fn: true },
    });
    expect(parsed).toEqual(down);
  });
});
