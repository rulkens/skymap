import { describe, expect, it } from 'vitest';
import { stampAxisMods } from '../../../src/utils/remote/stampAxisMods';
import type { DeviceEvent } from '../../../src/@types/input/DeviceEvent';

const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false };
const at = { x: 0.5, y: 0.5 };
const down: DeviceEvent = {
  kind: 'down',
  t: 0,
  pointer: 1,
  pointerType: 'touch',
  button: 0,
  at,
  mods: NO_MODS,
};

describe('stampAxisMods', () => {
  it.each([
    ['look', { ...NO_MODS, ctrl: true }],
    ['roll', { ...NO_MODS, shift: true }],
    ['zoom', { ...NO_MODS, alt: true }],
    ['orbit', NO_MODS],
  ] as const)('a down under %s gets its modifier', (axis, mods) => {
    expect(stampAxisMods(down, axis)).toEqual({ ...down, mods });
  });

  it('leaves a move untouched', () => {
    const move: DeviceEvent = { ...down, kind: 'move' };
    expect(stampAxisMods(move, 'look')).toBe(move);
  });
});
