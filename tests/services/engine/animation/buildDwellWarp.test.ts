/**
 * buildDwellWarp — unit tests for the add-time dwell reparametrisation.
 *
 * The warp maps wall-clock time → base (cruise) time. Away from waypoints it is
 * 1:1 (constant cruise); around each interior knot it advances base-time slowly
 * across a WINDOW (a sustained plateau, not a point), which lengthens the take.
 * These tests pin that contract without reaching into the geometry pipeline.
 */

import { describe, it, expect } from 'vitest';
import { buildDwellWarp } from '../../../../src/services/engine/animation/buildDwellWarp';

// A 2-leg cruise timeline: knots at base-time 0, 4, 8 (the middle one is the
// interior waypoint that dwells). Depth lives on the interior knot only.
const KNOT_TIME = [0, 4, 8];

describe('buildDwellWarp', () => {
  it('is the identity when every depth is 0 (no dwell)', () => {
    const w = buildDwellWarp(KNOT_TIME, [0, 0, 0], 2, 8);
    expect(w.totalSec).toBe(8);
    expect(w.baseTimeAt(0)).toBeCloseTo(0, 9);
    expect(w.baseTimeAt(4)).toBeCloseTo(4, 9);
    expect(w.baseTimeAt(8)).toBeCloseTo(8, 9);
  });

  it('is the identity when the window is 0, even with depth', () => {
    const w = buildDwellWarp(KNOT_TIME, [0, 1, 0], 0, 8);
    expect(w.totalSec).toBe(8);
    expect(w.baseTimeAt(6)).toBeCloseTo(6, 9);
  });

  it('ADDS wall-clock time when an interior knot dwells', () => {
    const w = buildDwellWarp(KNOT_TIME, [0, 0.9, 0], 2, 8);
    expect(w.totalSec).toBeGreaterThan(8);
    // Endpoints stay pinned: 0 → 0 and the full wall length → the full base span.
    expect(w.baseTimeAt(0)).toBeCloseTo(0, 6);
    expect(w.baseTimeAt(w.totalSec)).toBeCloseTo(8, 6);
  });

  it('advances base-time monotonically', () => {
    const w = buildDwellWarp(KNOT_TIME, [0, 0.9, 0], 2, 8);
    let prev = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const b = w.baseTimeAt((i / 200) * w.totalSec);
      expect(b).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = b;
    }
  });

  it('cruises 1:1 before the first dwell window (constant cruise)', () => {
    // Window is [base 3, base 5] (centre 4, half-width 1); base 0..3 is pure
    // cruise, so wall == base there.
    const w = buildDwellWarp(KNOT_TIME, [0, 0.9, 0], 2, 8);
    expect(w.baseTimeAt(1)).toBeCloseTo(1, 3);
    expect(w.baseTimeAt(2)).toBeCloseTo(2, 3);
  });

  it('treats windowSec as WALL-CLOCK: added time stays under the window width', () => {
    // The old base-time window braided the knobs: at depth 1 the camera runs at
    // ~12% cruise, so a base-time window cost ~4.7× its width in wall seconds
    // (windowSec 3 → ~11s added). Wall-clock semantics cap the whole slow
    // moment at ~windowSec, whatever the depth.
    const w = buildDwellWarp(KNOT_TIME, [0, 1, 0], 3, 8);
    expect(w.totalSec - 8).toBeLessThan(3);
    expect(w.totalSec).toBeGreaterThan(8); // still a real dwell
  });

  it('keeps the wall-clock length of the slow moment ~constant across depths', () => {
    // Measure the wall time spent below 95% cruise speed. Depth should set how
    // SLOW the crawl gets, not how LONG it lasts — both depths dwell for about
    // the authored window, so their spans stay within a small factor.
    const span = (depth: number): number => {
      const w = buildDwellWarp(KNOT_TIME, [0, depth, 0], 3, 8);
      const dt = w.totalSec / 4000;
      let t = 0;
      for (let i = 1; i < 4000; i++) {
        const wall = i * dt;
        const slope = (w.baseTimeAt(wall + dt) - w.baseTimeAt(wall - dt)) / (2 * dt);
        if (slope < 0.95) t += dt;
      }
      return t;
    };
    const shallow = span(0.4);
    const deep = span(1);
    expect(deep).toBeLessThan(3.2); // ≈ windowSec, not 4.7× it
    expect(deep / shallow).toBeLessThan(1.6);
  });

  it('crawls with the slow-down biased BEFORE the knot (approach, not departure)', () => {
    const w = buildDwellWarp(KNOT_TIME, [0, 0.9, 0], 2, 8);
    // Local slope dBase/dWall via finite difference.
    const slope = (wall: number): number => {
      const dt = 0.05;
      return (w.baseTimeAt(wall + dt) - w.baseTimeAt(wall - dt)) / (2 * dt);
    };
    // Scan for the slowest instant (min slope).
    let tMin = 0;
    let best = Infinity;
    for (let i = 1; i < 1000; i++) {
      const wall = (i / 1000) * w.totalSec;
      const s = slope(wall);
      if (s < best) {
        best = s;
        tMin = wall;
      }
    }
    expect(slope(1)).toBeCloseTo(1, 1); // cruise well before the window
    expect(best).toBeLessThan(0.5); // a real crawl
    // The slowest instant lands on the APPROACH — its base-time is before the
    // knot at base 4 (the dwell leads the waypoint, it doesn't straddle it).
    expect(w.baseTimeAt(tMin)).toBeLessThan(4);
  });
});
