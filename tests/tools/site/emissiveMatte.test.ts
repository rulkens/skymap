import { describe, expect, it } from 'vitest';

import { emissiveMatte } from '../../../tools/site/utils/emissiveMatte';

// Straight alpha laid OVER black must give back the frame: alpha × colour = what the app drew.
const overBlack = (out: Uint8Array) => [0, 1, 2].map((c) => Math.round((out[c]! * out[3]!) / 255));

describe('emissiveMatte', () => {
  it('black is empty', () => {
    expect(Array.from(emissiveMatte(Uint8Array.from([0, 0, 0, 255])))).toEqual([0, 0, 0, 0]);
  });

  it('a dim coloured glow keeps its hue at full brightness and carries its light in alpha', () => {
    const out = emissiveMatte(Uint8Array.from([60, 30, 90, 255]));
    expect(Array.from(out)).toEqual([170, 85, 255, 90]);
    expect(overBlack(out)).toEqual([60, 30, 90]);
  });

  it('a white-hot core is opaque white', () => {
    expect(Array.from(emissiveMatte(Uint8Array.from([255, 255, 255, 255])))).toEqual([
      255, 255, 255, 255,
    ]);
  });
});
