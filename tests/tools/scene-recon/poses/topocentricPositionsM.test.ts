/**
 * topocentricPositionsM — the pipeline string is the contract with PROJ's
 * `cct`, which CI has no reason to install, so these tests pin the string and
 * the one-subprocess-per-batch shape rather than the arithmetic (which is
 * PROJ's). The anchor round-trip that proves the pipeline lands `(0,0,0)` is a
 * `cct` run recorded in the commit message, not a test.
 */
import { describe, expect, it } from 'vitest';

import {
  topocentricPositionsM,
  type CctRunner,
} from '../../../../tools/scene-recon/poses/topocentricPositionsM';
import type { GroupAnchor } from '../../../../tools/scene-workbench/@types/GroupAnchor';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const ANCHOR: GroupAnchor = {
  kind: 'geodetic',
  latDeg: 55.67,
  lonDeg: 12.53,
  heightMDvr90: 18.53,
  headingDeg: 0,
};

const POINTS: readonly Vec3[] = [
  [721650.33, 6175011.07, 2200.39],
  [721979.55, 6175002.32, 18.53],
  [722100.5, 6174900.25, 2201.5],
];

function recordingRunner(lines: readonly string[]): {
  readonly runCct: CctRunner;
  readonly calls: { pipeline: string; inputLines: readonly string[] }[];
} {
  const calls: { pipeline: string; inputLines: readonly string[] }[] = [];
  return {
    calls,
    runCct: async (pipeline, inputLines) => {
      calls.push({ pipeline, inputLines });
      return lines;
    },
  };
}

describe('topocentricPositionsM', () => {
  it('batches every camera centre through one cct call', async () => {
    const { runCct, calls } = recordingRunner([
      '  -328.391922      25.488760   2181.851517           inf',
      '     0.000000       0.000000       0.000000           inf',
      '   198.930000    -110.500000   2182.900000           inf',
    ]);

    const out = await topocentricPositionsM(ANCHOR, POINTS, { runCct });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.inputLines).toEqual([
      '721650.33 6175011.07 2200.39',
      '721979.55 6175002.32 18.53',
      '722100.5 6174900.25 2201.5',
    ]);
    expect(out).toEqual([
      [-328.391922, 25.48876, 2181.851517],
      [0, 0, 0],
      [198.93, -110.5, 2182.9],
    ]);
  });

  it('composes the inverse-UTM32 → cart → topocentric pipeline with the anchor', async () => {
    const { runCct, calls } = recordingRunner(['0 0 0 inf', '0 0 0 inf', '0 0 0 inf']);

    await topocentricPositionsM(ANCHOR, POINTS, { runCct });

    // No leading `+proj=unitconvert`: PROJ's inverse UTM already emits radians,
    // unlike lidarPipelineStages' forward pipeline, which starts from degrees.
    expect(calls[0]!.pipeline).toBe(
      '+proj=pipeline +step +inv +proj=utm +zone=32 +ellps=GRS80 ' +
        '+step +proj=cart +ellps=GRS80 ' +
        '+step +proj=topocentric +lat_0=55.67 +lon_0=12.53 +h_0=18.53 +ellps=GRS80',
    );
  });
});
