import { describe, it, expect } from 'vitest';
import { chainOverlapViolations } from '../../../src/utils/scene/chainOverlapViolations';
import type { ChainRow } from '../../../src/@types/scene/ChainRow';

// Hand-picked, physically-plausible Jupiter/Io numbers (not a registry lookup):
// Jupiter radius 71,492 km, Io radius 1,821.6 km, Io's orbital radius 421,700 km.
// Camera-to-Jupiter distance fixed at 1,000,000,000 m across both fixtures below.
const D_JUPITER_M = 1_000_000_000;
const R_JUPITER_M = 71_492_000;
const R_IO_M = 1_821_600;
const IO_ORBIT_RADIUS_M = 421_700_000;

const jupiterRow: ChainRow = {
  index: 0,
  distanceRangeM: [D_JUPITER_M - R_JUPITER_M, D_JUPITER_M + R_JUPITER_M],
  centrePx: [960, 540],
  radiusPx: 40,
};

describe('chainOverlapViolations', () => {
  it('reports nothing for Jupiter + Galileans at transit', () => {
    // Io directly between camera and Jupiter, so their screen circles overlap
    // (same line of sight) — but Io sits a full orbital radius closer to the
    // camera, so the distance intervals are cleanly separated.
    const ioTransit: ChainRow = {
      index: 1,
      distanceRangeM: [
        D_JUPITER_M - IO_ORBIT_RADIUS_M - R_IO_M,
        D_JUPITER_M - IO_ORBIT_RADIUS_M + R_IO_M,
      ],
      centrePx: [960, 540], // same line of sight as Jupiter
      radiusPx: 3,
    };
    expect(chainOverlapViolations([jupiterRow, ioTransit])).toEqual([]);
  });

  it('reports nothing for Jupiter + Io at quadrature', () => {
    // At quadrature Io sits almost exactly Jupiter's own distance from the
    // camera (the lateral offset is perpendicular to the line of sight), so
    // the distance intervals overlap — but Io is angularly far from Jupiter
    // on screen, so the bounding circles do not. This is the case S6's
    // literal "intervals never overlap" reading would wrongly flag.
    const ioQuadrature: ChainRow = {
      index: 1,
      distanceRangeM: [D_JUPITER_M - R_IO_M, D_JUPITER_M + R_IO_M],
      centrePx: [960 + 200, 540], // 200px off to the side, clear of Jupiter's disc
      radiusPx: 3,
    };
    expect(chainOverlapViolations([jupiterRow, ioQuadrature])).toEqual([]);
  });

  it('reports a genuine painter-order violation', () => {
    // A second body whose screen circle overlaps Jupiter's AND whose distance
    // interval also overlaps Jupiter's — an actual painter-ordering hazard.
    const intruder: ChainRow = {
      index: 1,
      distanceRangeM: [D_JUPITER_M - R_IO_M, D_JUPITER_M + R_IO_M],
      centrePx: [965, 542], // a few px from Jupiter's centre — well inside 40+10
      radiusPx: 10,
    };
    expect(chainOverlapViolations([jupiterRow, intruder])).toEqual([[0, 1]]);
  });
});
