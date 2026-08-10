import { describe, it, expect } from 'vitest';
import { parsePolyphyTraceSidecar } from '../../../tools/parsers/polyphyTraceSidecar';

/**
 * The spec's example sidecar (design doc, Decision 2), verbatim field-for-
 * field. Individual tests clone it and override one field so each failure
 * is isolated to the rule under test.
 */
const VALID_SIDECAR = {
  format: 'polyphy-trace',
  version: 1,
  dims: [282, 512, 289],
  origin_mpc: [-498.449, -486.34, -64.526],
  voxel_size_mpc: [1.8367, 1.8351, 1.8394],
  frame: 'equatorial-cartesian',
  value_units: 'mcpm-trace-density',
  provenance: {
    polyphy_commit: '704d755',
    input_csv: 'rhizome/cache/sdss_calibration.csv',
    input_csv_sha256: '…',
    params: { num_iterations: 700, trace_res_max: 512 },
    produced_at: '2026-08-10T12:00:00+0200',
    wall_clock_s: 512.3,
  },
};

describe('parsePolyphyTraceSidecar', () => {
  it('rejects a sidecar whose format is not polyphy-trace', () => {
    const text = JSON.stringify({ ...VALID_SIDECAR, format: 'scfd-meta' });
    expect(() => parsePolyphyTraceSidecar(text)).toThrow('is not "polyphy-trace"');
  });

  it('rejects an unsupported schema version', () => {
    const text = JSON.stringify({ ...VALID_SIDECAR, version: 2 });
    expect(() => parsePolyphyTraceSidecar(text)).toThrow('unsupported version 2');
    // Regenerate hint, same shape as scalarFieldFormat.ts:201-204's
    // "regenerate the cube via the dataset's build pipeline".
    expect(() => parsePolyphyTraceSidecar(text)).toThrow('regenerate');
  });

  it('rejects a non-3-element voxel_size_mpc', () => {
    const text = JSON.stringify({ ...VALID_SIDECAR, voxel_size_mpc: [1.8, 1.8] });
    expect(() => parsePolyphyTraceSidecar(text)).toThrow('must be 3 finite numbers');
  });

  it('rejects a non-finite origin', () => {
    // A plain Array.isArray + length check would let this through — the
    // element-wise typeof/Number.isFinite check is what rule 4 requires.
    const text = JSON.stringify({ ...VALID_SIDECAR, origin_mpc: [0, null, 0] });
    expect(() => parsePolyphyTraceSidecar(text)).toThrow('must be 3 finite numbers');
  });

  it('rejects an unknown frame', () => {
    const text = JSON.stringify({ ...VALID_SIDECAR, frame: 'ecliptic' });
    expect(() => parsePolyphyTraceSidecar(text)).toThrow('unknown frame');
  });

  it('parses the calibration sidecar into camelCase fields', () => {
    const result = parsePolyphyTraceSidecar(JSON.stringify(VALID_SIDECAR));
    expect(result.dims).toEqual([282, 512, 289]);
    expect(result.originMpc).toEqual([-498.449, -486.34, -64.526]);
    // Uncollapsed: all three axis values survive, not a mean — the cubic
    // collapse is the builder's job (spec Decision 3), not this parser's.
    expect(result.voxelSizeMpc).toEqual([1.8367, 1.8351, 1.8394]);
    expect(result.frame).toBe('equatorial-cartesian');
    // Pass-through, not reshaped: still snake_case inside the opaque object.
    expect(result.provenance?.polyphy_commit).toBe('704d755');
  });
});
