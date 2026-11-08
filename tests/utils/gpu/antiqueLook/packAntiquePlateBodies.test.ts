/**
 * packAntiquePlateBodies — the bytes must land where `plateBodies.wesl`'s struct
 * reads them (a slip shades every globe from the wrong Sun), the print codes must
 * match its PRINT_* constants, records past the
 * capacity are dropped, and a ringless body leaves the ring's outer edge at 0,
 * the shader's "no ring", even when the buffer held a ringed body last frame; a
 * spotless body likewise leaves the spot's flag at 0, or Jupiter's Red Spot prints on Mars.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { packAntiquePlateBodies } from '../../../../src/utils/gpu/antiqueLook/packAntiquePlateBodies';
import {
  ANTIQUE_BODY_PRINT_CODES,
  ANTIQUE_PLATE_BODY_CAPACITY,
} from '../../../../src/data/rendering/antiquePlateBodies';
import type { AntiquePlateBody } from '../../../../src/@types/rendering/AntiquePlateBody';

const SHADER = readFileSync('src/services/gpu/shaders/antiqueLook/plateBodies.wesl', 'utf8');

const saturn: AntiquePlateBody = {
  centre: [1, 2, 3],
  radiusM: 58_232_000,
  radiusUnits: 120,
  sun: [0, 0.6, 0.8],
  print: 'plain',
  pole: [0, 0, 1],
  ring: { lines: [1.28, 1.58, 2.06, 2.35], outer: 2.41 },
  spot: null,
};
const earth: AntiquePlateBody = {
  centre: [4, 5, 6],
  radiusM: 6_371_000,
  radiusUnits: 300,
  sun: [1, 0, 0],
  print: 'earth',
  pole: [0, 0.6, 0.8],
  ring: null,
  spot: null,
};
const jupiter: AntiquePlateBody = { ...earth, print: 'jupiter', spot: [0.6, 0, -0.8] };

describe('packAntiquePlateBodies', () => {
  it('mirrors the shader struct: centre, sun, ring, ringEdges, spot, behind a 16-byte count', () => {
    const fields = /struct PlateBody \{([^}]*)\}/.exec(SHADER)![1]!;
    expect([...fields.matchAll(/(\w+): vec4<f32>/g)].map((m) => m[1])).toEqual([
      'centre',
      'sun',
      'ring',
      'ringEdges',
      'spot',
    ]);
    expect(SHADER).toContain(`items: array<PlateBody, ${ANTIQUE_PLATE_BODY_CAPACITY}>`);
  });

  // A ringless body still carries its pole: the Mars print hatches along its latitude.
  it('writes each record at its slot', () => {
    const out = packAntiquePlateBodies([earth, saturn]);
    const f32 = new Float32Array(out);
    expect(new Uint32Array(out)[0]).toBe(2);
    expect([...f32.slice(4, 24)]).toEqual(
      [4, 5, 6, 300, 1, 0, 0, 1, 0, 0.6, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0].map(Math.fround),
    );
    expect([...f32.slice(24, 44)]).toEqual(
      [1, 2, 3, 120, 0, 0.6, 0.8, 0, 0, 0, 1, 2.41, 1.28, 1.58, 2.06, 2.35, 0, 0, 0, 0].map(
        Math.fround,
      ),
    );
  });

  // The plate dispatches each body to its module by this code: a drift draws Mars as Earth.
  it('mirrors every print convention code as a PRINT_* constant', () => {
    const shader = Object.fromEntries(
      [...SHADER.matchAll(/const PRINT_(\w+): u32 = (\d+)u;/g)].map((m) => [
        m[1]!.toLowerCase(),
        Number(m[2]),
      ]),
    );
    expect(shader).toEqual(ANTIQUE_BODY_PRINT_CODES);
  });

  it('drops records past the capacity', () => {
    const many = Array.from({ length: ANTIQUE_PLATE_BODY_CAPACITY + 2 }, () => earth);
    expect(new Uint32Array(packAntiquePlateBodies(many))[0]).toBe(ANTIQUE_PLATE_BODY_CAPACITY);
  });

  it('clears last frame’s ring when the slot now holds a ringless body', () => {
    const out = packAntiquePlateBodies([saturn]);
    packAntiquePlateBodies([earth], out);
    expect(new Float32Array(out)[4 + 11]).toBe(0);
  });

  it('writes a spot as its direction and a flag, cleared when the slot is spotless', () => {
    const out = packAntiquePlateBodies([jupiter]);
    expect([...new Float32Array(out).slice(4 + 16, 4 + 20)]).toEqual(
      [0.6, 0, -0.8, 1].map(Math.fround),
    );
    packAntiquePlateBodies([earth], out);
    expect(new Float32Array(out)[4 + 19]).toBe(0);
  });
});
