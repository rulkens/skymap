/**
 * notedTiltMemory — the tilt memory's one key rule (ruling 18). The wipe is
 * invisible until a tilt survives a body switch, which is why it is pinned
 * here rather than left to the frame-level fixtures that only read it.
 */

import { describe, it, expect } from 'vitest';

import { notedTiltMemory } from '../../../src/utils/camera/notedTiltMemory';
import type { TiltMemory } from '../../../src/@types/camera/TiltMemory';

describe('notedTiltMemory', () => {
  it('wipes the remembered tilt when the host changes, keeps it on null, and is identity on the same host', () => {
    const seeded: TiltMemory = { hostId: 'earth', rememberedTiltRad: 0.4 };

    // Ruling 18: a host SWITCH wipes the memory, never restores it per body.
    expect(notedTiltMemory(seeded, 'planet')).toEqual({ hostId: 'planet', rememberedTiltRad: 0 });
    // No host to key on this frame — the world arm still reads the tilt, so
    // the absence of a host must not read as a switch.
    expect(notedTiltMemory(seeded, null)).toBe(seeded);
    expect(notedTiltMemory(seeded, 'earth')).toBe(seeded);
    // Nothing noted yet is not a switch: the first note adopts the host.
    expect(notedTiltMemory({ hostId: null, rememberedTiltRad: 0.4 }, 'planet')).toEqual({
      hostId: 'planet',
      rememberedTiltRad: 0.4,
    });
  });
});
