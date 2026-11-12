import { describe, expect, it } from 'vitest';

import type { MpcorbRow } from '../../../../tools/@types/asteroids/MpcorbRow';
import type { OrbitalElements } from '../../../../src/@types/scene/OrbitalElements';
import { writeAsteroidCatalog } from '../../../../tools/utils/io/writeAsteroidCatalog';
import { parseAsteroidCatalog } from '../../../../src/layers/asteroids/catalog/load/parseAsteroidCatalog';
import { ASTEROID_HIDDEN_FLAG } from '../../../../src/layers/asteroids/catalog/data/asteroidHiddenFlag';
import { MESH_ASTEROID_NUMBERS } from '../../../../src/layers/asteroids/catalog/data/meshAsteroidNumbers';
import { keplerianPositionMpc } from '../../../../src/utils/orbit/keplerianPositionMpc';
import { eccentricAnomalyFromMean } from '../../../../src/utils/orbit/eccentricAnomalyFromMean';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

const EPOCH = 2461200.5;
const row = (number: number, over: Partial<MpcorbRow> = {}): MpcorbRow => ({
  number,
  h: 15.2,
  g: 0.15,
  epochJd: EPOCH,
  meanAnomalyDeg: 212.7,
  argPeriDeg: 151.3,
  nodeDeg: 304.4,
  inclDeg: 22.8,
  e: 0.37,
  aAu: 2.44,
  asteroidClass: 'mainBelt',
  neo: false,
  pha: false,
  name: null,
  ...over,
});
const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

describe('parseAsteroidCatalog', () => {
  it("decoded basis gives keplerianPositionMpc's position at the epoch", () => {
    const cat = parseAsteroidCatalog(toBuffer(writeAsteroidCatalog([row(1)], EPOCH).bytes));
    // Same decoded f32 elements, through the scene's own path (ecliptic plane by default); a in AU
    // stands in for Mpc since the map is linear.
    const elements: OrbitalElements = {
      id: asSceneBodyId('asteroid'),
      focusId: asSceneBodyId('sun'),
      semiMajorMpc: cat.a[0]!,
      eccentricity: cat.e[0]!,
      inclinationRad: cat.i[0]!,
      ascendingNodeRad: cat.node[0]!,
      argPeriapsisRad: cat.peri[0]!,
      meanAnomalyRad: cat.m0[0]!,
      color: [0, 0, 0],
    };
    const expected = keplerianPositionMpc(elements);
    const [ax, ay, az, e] = cat.elementsA;
    const [bx, by, bz] = cat.elementsB;
    const m0 = new Float32Array(cat.extra.buffer)[0]!;
    expect(m0).toBe(cat.m0[0]);
    const E = eccentricAnomalyFromMean(m0, e!);
    const got = [
      ax! * (Math.cos(E) - e!) + bx! * Math.sin(E),
      ay! * (Math.cos(E) - e!) + by! * Math.sin(E),
      az! * (Math.cos(E) - e!) + bz! * Math.sin(E),
    ];
    got.forEach((v, axis) => expect(Math.abs(v - expected[axis]!)).toBeLessThan(1e-6));
  });

  it('hides the four mesh numbers and ABSENT rows, and no other row', () => {
    const gap = 2000;
    const last = Math.max(...MESH_ASTEROID_NUMBERS);
    const rows = Array.from({ length: last }, (_, k) => row(k + 1)).filter((r) => r.number !== gap);
    const cat = parseAsteroidCatalog(toBuffer(writeAsteroidCatalog(rows, EPOCH).bytes));
    const hidden: number[] = [];
    cat.flags.forEach((f, k) => {
      if (f & ASTEROID_HIDDEN_FLAG) hidden.push(k + 1);
    });
    expect(hidden).toEqual([...MESH_ASTEROID_NUMBERS, gap].sort((x, y) => x - y));
    expect(cat.extra[2 * (gap - 1) + 1]! & 0xff).toBe(cat.flags[gap - 1]);
    expect(cat.elementsB[4 * (gap - 1) + 3]).toBe(0);
  });

  it('rejects a wrong magic', () => {
    const bytes = writeAsteroidCatalog([row(1)], EPOCH).bytes;
    bytes[0] = 'X'.charCodeAt(0);
    expect(() => parseAsteroidCatalog(toBuffer(bytes))).toThrow(/bad magic "XSTB"/);
  });
});
