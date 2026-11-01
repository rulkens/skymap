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

  it('keeps the up of a drag that ended off the trackpad', () => {
    const up: DeviceEvent = { ...down, kind: 'up', at: { x: 1.4, y: -0.2 } };
    expect(parseDeviceEvent(up)).toEqual(up);
  });

  it('drops an at far outside the surface', () => {
    expect(parseDeviceEvent({ ...down, at: { x: 12, y: 0.5 } })).toBeNull();
    expect(parseDeviceEvent({ ...down, at: { x: 0.5, y: -11 } })).toBeNull();
  });

  it('drops a pointer id that is negative, fractional or too large', () => {
    for (const pointer of [-1, 1.5, 2 ** 31])
      expect(parseDeviceEvent({ ...down, pointer })).toBeNull();
  });

  it('drops a wheel ratio that is zero or negative', () => {
    for (const ratio of [0, -1.2])
      expect(parseDeviceEvent({ kind: 'wheel', t: 1, ratio, at: down.at, mods })).toBeNull();
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
