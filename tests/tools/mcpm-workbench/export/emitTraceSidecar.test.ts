/**
 * emitTraceSidecar — round-tripped through the REAL importer parser
 * (parsePolyphyTraceSidecar), not a hand-rolled JSON.parse, so a
 * snake_case/nesting mistake fails here rather than at buildRhizomeVolume
 * time. Test 2 feeds a real autoFitGridBox output through, per the brief:
 * that's the cross-file contract the grid fit's cubic-voxel invariant
 * exists for.
 */
import { describe, expect, it } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { parsePolyphyTraceSidecar } from '../../../../tools/parsers/polyphyTraceSidecar';
import { autoFitGridBox } from '../../../../tools/mcpm-workbench/src/field/autoFitGridBox';
import { emitTraceSidecar } from '../../../../tools/mcpm-workbench/src/export/emitTraceSidecar';
import type { AgentWeights } from '../../../../tools/mcpm-workbench/@types/AgentWeights';
import type { CatalogPoints } from '../../../../tools/mcpm-workbench/@types/CatalogPoints';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import type { McpmParams } from '../../../../tools/mcpm-workbench/@types/McpmParams';

const PARAMS: McpmParams = {
  senseSpreadDeg: 20,
  senseDistanceMpc: 4.6,
  turnAngleDeg: 10,
  moveDistanceMpc: 0.1,
  depositValue: 0,
  persistence: 0.8,
  sharpness: 2.5,
  normalizationFactor: 1.0,
};

function pointsFixture(): CatalogPoints {
  return {
    positions: new Float32Array(0),
    log10StellarMass: new Float32Array(0),
    count: 1_642_391,
    sources: [Source.SDSS, Source.TwoMRS, Source.Glade],
  };
}

const WEIGHTS: AgentWeights = {
  weights: new Float32Array(0),
  nanCount: 20_114,
  medianLog10Mass: 10.2,
};

// Mirrors emitTraceSidecar's own local-time-with-numeric-offset format —
// asserted independently of the test runner's timezone (spec §8's example
// is CEST, but CI may run in UTC or anywhere else).
function expectedProducedAt(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const offsetH = pad(Math.floor(Math.abs(offsetMin) / 60));
  const offsetM = pad(Math.abs(offsetMin) % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${offsetH}${offsetM}`
  );
}

describe('emitTraceSidecar', () => {
  it('round trips every field through parsePolyphyTraceSidecar, including the snake_case hop and nested provenance', () => {
    const box: GridBox = {
      centerMpc: [-356, -600, -364],
      sizeMpc: [712, 1200, 728],
      dims: [712, 1200, 728],
      voxelSizeMpc: 1,
    };
    const producedAt = new Date(2026, 7, 18, 14, 2, 11); // 2026-08-18T14:02:11 local
    const text = emitTraceSidecar({
      box,
      points: pointsFixture(),
      weights: WEIGHTS,
      tier: 'large',
      params: PARAMS,
      agentCount: 10_000_000,
      steps: 5000,
      seed: 12345,
      producedAt,
    });

    // The wire format itself, ahead of the parser: keys stay snake_case.
    const raw: unknown = JSON.parse(text);
    expect(raw).toMatchObject({
      format: 'polyphy-trace',
      version: 1,
      dims: [712, 1200, 728],
      origin_mpc: [-712, -1200, -728],
      voxel_size_mpc: [1, 1, 1],
      frame: 'equatorial-cartesian',
      value_units: 'mcpm-trace-density',
      provenance: {
        producer: 'mcpm-workbench',
        catalog: {
          sources: ['sdss', '2mrs', 'glade'],
          tier: 'large',
          n_points: 1_642_391,
          nan_mass_filled: 20_114,
        },
        params: PARAMS,
        n_agents: 10_000_000,
        steps: 5000,
        seed: 12345,
      },
    });

    const parsed = parsePolyphyTraceSidecar(text);
    expect(parsed.dims).toEqual([712, 1200, 728]);
    expect(parsed.originMpc).toEqual([-712, -1200, -728]);
    expect(parsed.voxelSizeMpc).toEqual([1, 1, 1]);
    expect(parsed.frame).toBe('equatorial-cartesian');
    expect(parsed.valueUnits).toBe('mcpm-trace-density');
    // provenance is opaque pass-through past the parser (spec Decision 2) —
    // still snake_case, still nested, exactly as written.
    expect(parsed.provenance).toEqual({
      producer: 'mcpm-workbench',
      produced_at: expectedProducedAt(producedAt),
      catalog: {
        sources: ['sdss', '2mrs', 'glade'],
        tier: 'large',
        n_points: 1_642_391,
        nan_mass_filled: 20_114,
      },
      params: PARAMS,
      n_agents: 10_000_000,
      steps: 5000,
      seed: 12345,
    });
  });

  it('a sidecar built from an autoFitGridBox box passes the importer 0.5% voxel-size spread rule', () => {
    // Asymmetric bounds — the shape autoFitGridBox actually rounds
    // per-axis (dims land on different multiples-of-8), unlike the
    // hand-built cubic box in the first test.
    const box = autoFitGridBox({ min: [0, 0, 0], max: [100, 50, 30] }, 64, 4);
    const text = emitTraceSidecar({
      box,
      points: pointsFixture(),
      weights: WEIGHTS,
      tier: 'medium',
      params: PARAMS,
      agentCount: 5_000_000,
      steps: 1000,
      seed: 1,
      producedAt: new Date(),
    });

    const sidecar = parsePolyphyTraceSidecar(text);
    // buildRhizomeVolume.ts's own rule 6 spread check, mirrored here:
    // https://…/tools/volumes/buildRhizomeVolume.ts ("Voxel-size spread assert").
    const [vx, vy, vz] = sidecar.voxelSizeMpc;
    const mean = (vx + vy + vz) / 3;
    const spread = (Math.max(vx, vy, vz) - Math.min(vx, vy, vz)) / mean;
    expect(spread).toBeLessThanOrEqual(0.005);
    // GridBox's voxels are exactly cubic (not just within tolerance) —
    // the sidecar carries the SAME number three times, not three
    // independently-rounded ones.
    expect(vx).toBe(vy);
    expect(vy).toBe(vz);
    expect(sidecar.dims).toEqual(box.dims);
  });
});
