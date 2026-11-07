/**
 * packAntiquePlateBodies — the bytes must land where `plateBodies.wesl`'s struct
 * reads them (a slip shades every globe from the wrong Sun), records past the
 * capacity are dropped, and a ringless body leaves the ring's outer edge at 0,
 * the shader's "no ring", even when the buffer held a ringed body last frame.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { packAntiquePlateBodies } from '../../../../src/utils/gpu/antiqueLook/packAntiquePlateBodies';
import { ANTIQUE_PLATE_BODY_CAPACITY } from '../../../../src/data/rendering/antiquePlateBodies';
import type { AntiquePlateBody } from '../../../../src/@types/rendering/AntiquePlateBody';

const SHADER = readFileSync('src/services/gpu/shaders/antiqueLook/plateBodies.wesl', 'utf8');

const saturn: AntiquePlateBody = {
  centre: [1, 2, 3],
  radiusUnits: 120,
  sun: [0, 0.6, 0.8],
  land: false,
  ring: { normal: [0, 0, 1], lines: [1.28, 1.58, 2.06, 2.35], outer: 2.41 },
};
const earth: AntiquePlateBody = {
  centre: [4, 5, 6],
  radiusUnits: 300,
  sun: [1, 0, 0],
  land: true,
  ring: null,
};

describe('packAntiquePlateBodies', () => {
  it('mirrors the shader struct: centre, sun, ring, ringEdges, behind a 16-byte count', () => {
    const fields = /struct PlateBody \{([^}]*)\}/.exec(SHADER)![1]!;
    expect([...fields.matchAll(/(\w+): vec4<f32>/g)].map((m) => m[1])).toEqual([
      'centre',
      'sun',
      'ring',
      'ringEdges',
    ]);
    expect(SHADER).toContain(`items: array<PlateBody, ${ANTIQUE_PLATE_BODY_CAPACITY}>`);
  });

  it('writes each record at its slot', () => {
    const out = packAntiquePlateBodies([earth, saturn]);
    const f32 = new Float32Array(out);
    expect(new Uint32Array(out)[0]).toBe(2);
    expect([...f32.slice(4, 20)]).toEqual([4, 5, 6, 300, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...f32.slice(20, 36)]).toEqual(
      [1, 2, 3, 120, 0, 0.6, 0.8, 0, 0, 0, 1, 2.41, 1.28, 1.58, 2.06, 2.35].map(Math.fround),
    );
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
});
