/**
 * zoomPanGeodesic tests — van Wijk & Nuij, "Smooth and Efficient Zooming and
 * Panning" (IEEE InfoVis 2003).
 *
 * PAPER_EQ9 and metricSpeed are independent transcriptions of the paper's eq. 9
 * and eq. 6 in the paper's own literal algebra (the `ease.test.ts` REF pattern).
 * Do not tidy them into project style and do not "fix" them to match the
 * implementation — the two restructurings the implementation carries are exactly
 * what they exist to cross-check. PAPER_EQ9 is only sound at the paper's own
 * scale; at skymap's it returns −Infinity / 0, which IS what the property tests
 * below pin.
 */

import { describe, it, expect } from 'vitest';
import { zoomPanGeodesic } from '../../../src/utils/camera/zoomPanGeodesic';
import { relErr } from '../../support/relErr';

const RHO = 1.42;

/** w = 2·d·tan(fovY/2) — the caller's conversion, here only to get realistic w. */
const FOV_Y = (50 * Math.PI) / 180;
const viewWidth = (distanceMpc: number) => 2 * distanceMpc * Math.tan(FOV_Y / 2);

// Verbatim eq. 9 of the paper, including the forms the implementation replaces.
const PAPER_EQ9 = (u0: number, w0: number, u1: number, w1: number, rho: number) => {
  const b = (i: number) =>
    (w1 * w1 - w0 * w0 + (-1) ** i * rho ** 4 * (u1 - u0) ** 2) /
    (2 * (i === 0 ? w0 : w1) * rho ** 2 * (u1 - u0));
  const r = (i: number) => Math.log(-b(i) + Math.sqrt(b(i) ** 2 + 1));
  return {
    S: (r(1) - r(0)) / rho,
    w: (s: number) => (w0 * Math.cosh(r(0))) / Math.cosh(rho * s + r(0)),
    u: (s: number) =>
      (w0 / rho ** 2) * Math.cosh(r(0)) * Math.tanh(rho * s + r(0)) -
      (w0 / rho ** 2) * Math.sinh(r(0)) +
      u0,
  };
};

// Verbatim eq. 6: ds² = (ρ²/w²) du² + (1/(ρ²w²)) dw².
function metricSpeed(rho: number, w: number, du: number, dw: number): number {
  return Math.sqrt(((rho * rho) / (w * w)) * du * du + (1 / (rho * rho * w * w)) * dw * dw);
}

/** [name, u0, w0, u1, w1] — the four moves the spec measured, in Mpc. */
const MOVES: readonly [string, number, number, number, number][] = [
  ['star → Milky Way', 0, viewWidth(2e-9), 0.0082, viewWidth(0.05)],
  ['Earth → nearby star', 0, viewWidth(4.3e-14), 1.301e-6, viewWidth(2e-9)],
  ['Milky Way → Virgo', 0, viewWidth(0.05), 16.5, viewWidth(5)],
  ['galaxy → galaxy', 0, viewWidth(50), 50, viewWidth(50)],
];

describe('zoomPanGeodesic', () => {
  it.each([
    ...MOVES,
    // Landmine 2's case: the paper's literal u(s) returns exactly u₀ here.
    ['Δu = 1e-9 Mpc under a 100× zoom', 0, viewWidth(10), 1e-9, viewWidth(1000)],
    ['u₀ ≠ 0, so the offset must be carried', 3.7, viewWidth(1), 9.2, viewWidth(0.2)],
  ] satisfies readonly [string, number, number, number, number][])(
    'endpoints are exact: %s',
    (_name, u0, w0, u1, w1) => {
      const g = zoomPanGeodesic(u0, w0, u1, w1, RHO);
      const start = g.at(0);
      const end = g.at(g.length);
      expect(relErr(start.u, u0)).toBeLessThanOrEqual(1e-12);
      expect(relErr(start.w, w0)).toBeLessThanOrEqual(1e-12);
      expect(relErr(end.u, u1)).toBeLessThanOrEqual(1e-12);
      expect(relErr(end.w, w1)).toBeLessThanOrEqual(1e-12);
    },
  );

  it('length matches the degenerate closed form as Δu → 0', () => {
    const w0 = viewWidth(10);
    const w1 = viewWidth(1000);
    const closedForm = Math.abs(Math.log(w1 / w0)) / RHO;
    for (const du of [1e-3, 1e-4, 1e-6, 1e-9, 0]) {
      expect(zoomPanGeodesic(0, w0, du, w1, RHO).length).toBeCloseTo(closedForm, 9);
    }
  });

  it('no non-finite output across the full scale range', () => {
    // Earth surface (~2e-16 Mpc) through the observable universe, every
    // combination of start distance × end distance × separation.
    const SCALES = [2e-16, 4.3e-14, 2e-9, 1.3e-6, 8.2e-3, 5e-2, 5, 50, 1000, 4000];
    for (const d0 of SCALES) {
      for (const d1 of SCALES) {
        for (const sep of SCALES) {
          const g = zoomPanGeodesic(0, viewWidth(d0), sep, viewWidth(d1), RHO);
          const where = `d0=${d0} d1=${d1} sep=${sep}`;
          expect(Number.isFinite(g.length), `length ${where}`).toBe(true);
          for (let i = 0; i <= 50; i++) {
            const { u, w } = g.at((i / 50) * g.length);
            expect(Number.isFinite(u) && Number.isFinite(w), `sample ${i} ${where}`).toBe(true);
          }
        }
      }
    }
  });

  it.each([
    ...MOVES,
    // Equal widths: the sign-flipped path lands on exactly −u₁ here.
    ['equal widths', 0, viewWidth(50), 120, viewWidth(50)],
  ] satisfies readonly [string, number, number, number, number][])(
    'a move with u₁ > u₀ ends at u₁, not −u₁: %s',
    (_name, u0, w0, u1, w1) => {
      const g = zoomPanGeodesic(u0, w0, u1, w1, RHO);
      expect(g.length).toBeGreaterThan(0);
      expect(g.at(g.length).u).toBeGreaterThan(u0);
      let previous = g.at(0).u;
      for (let i = 1; i <= 100; i++) {
        const u = g.at((i / 100) * g.length).u;
        expect(u).toBeGreaterThanOrEqual(previous);
        previous = u;
      }
    },
  );

  it('w is unimodal for a pan-dominated move and monotone for a pure zoom', () => {
    const signChanges = (g: ReturnType<typeof zoomPanGeodesic>) => {
      let changes = 0;
      let direction = 0;
      let previous = g.at(0).w;
      for (let i = 1; i <= 200; i++) {
        const w = g.at((i / 200) * g.length).w;
        const step = Math.sign(w - previous);
        if (step !== 0) {
          if (direction !== 0 && step !== direction) changes++;
          direction = step;
        }
        previous = w;
      }
      return changes;
    };

    for (const [name, u0, w0, u1, w1] of MOVES) {
      expect(signChanges(zoomPanGeodesic(u0, w0, u1, w1, RHO)), name).toBeLessThanOrEqual(1);
    }
    expect(signChanges(zoomPanGeodesic(0, viewWidth(10), 0, viewWidth(1000), RHO))).toBe(0);
    expect(signChanges(zoomPanGeodesic(0, viewWidth(1000), 0, viewWidth(10), RHO))).toBe(0);
  });

  it.each(MOVES)('perceived velocity is constant: %s', (_name, u0, w0, u1, w1) => {
    const g = zoomPanGeodesic(u0, w0, u1, w1, RHO);
    const samples = 200;
    const h = g.length / (samples * 4);
    const speeds: number[] = [];
    for (let i = 1; i < samples; i++) {
      const s = (i / samples) * g.length;
      const before = g.at(s - h);
      const after = g.at(s + h);
      speeds.push(
        metricSpeed(RHO, g.at(s).w, (after.u - before.u) / (2 * h), (after.w - before.w) / (2 * h)),
      );
    }
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const variance = speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length;
    // Unit speed: `length` is the arc length of the very metric sampled here,
    // so the mean pins the parametrisation and the CV pins its uniformity.
    expect(mean).toBeCloseTo(1, 3);
    expect(Math.sqrt(variance) / mean).toBeLessThan(1e-3);
  });

  it('a zero-length move samples its endpoint', () => {
    const w = viewWidth(3);
    const g = zoomPanGeodesic(7, w, 7, w, RHO);
    expect(g.length).toBe(0);
    expect(g.at(0)).toEqual({ u: 7, w });
    expect(g.at(g.length)).toEqual({ u: 7, w });
  });

  it("matches the paper's verbatim eq. 9 at the scale the paper was written for", () => {
    // 2-D map browsing over a few orders of magnitude, where the literal forms
    // are still numerically sound. Tolerances are relative to each move's own
    // span because the literal u(s) already loses ~1e-14 absolute to cancellation.
    const cases: readonly [number, number, number, number][] = [
      [0, 100, 1000, 10],
      [0, 10, 1000, 100],
      [0, 50, 400, 50],
      [5, 8, 30, 2],
    ];
    for (const [u0, w0, u1, w1] of cases) {
      const reference = PAPER_EQ9(u0, w0, u1, w1, RHO);
      const g = zoomPanGeodesic(u0, w0, u1, w1, RHO);
      expect(relErr(g.length, reference.S)).toBeLessThan(1e-9);
      for (let i = 0; i <= 20; i++) {
        const s = (i / 20) * reference.S;
        const { u, w } = g.at(s);
        expect(Math.abs(u - reference.u(s))).toBeLessThan(1e-9 * Math.abs(u1 - u0));
        expect(Math.abs(w - reference.w(s))).toBeLessThan(1e-9 * Math.max(w0, w1));
      }
    }
  });
});
