/**
 * Pure unit tests for `assertWorkbenchProvenance` — the promotion CLI's
 * refusal gate against a sidecar that isn't an actual MCPM-workbench export.
 * No filesystem I/O: schema errors (missing `dims`, wrong `format`) are
 * `parsePolyphyTraceSidecar`'s own tested contract, exercised here only to
 * confirm this gate surfaces them rather than swallowing them.
 */
import { describe, it, expect } from 'vitest';
import { assertWorkbenchProvenance } from '../../tools/volumes/promoteWorkbenchExport';

function sidecar(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: 'polyphy-trace',
    version: 1,
    dims: [4, 4, 4],
    origin_mpc: [0, 0, 0],
    voxel_size_mpc: [1, 1, 1],
    frame: 'equatorial-cartesian',
    provenance: { producer: 'mcpm-workbench' },
    ...overrides,
  });
}

describe('assertWorkbenchProvenance', () => {
  it('accepts a sidecar whose provenance.producer is mcpm-workbench', () => {
    expect(() => assertWorkbenchProvenance(sidecar())).not.toThrow();
  });

  it('refuses a sidecar produced by a different tool (e.g. the polyphorm importer)', () => {
    expect(() =>
      assertWorkbenchProvenance(sidecar({ provenance: { producer: 'polyphorm-2mrs' } })),
    ).toThrow(/provenance.producer/);
  });

  it('refuses a sidecar with no provenance object at all', () => {
    expect(() => assertWorkbenchProvenance(sidecar({ provenance: undefined }))).toThrow(
      /provenance.producer/,
    );
  });

  it('refuses a provenance object with no producer key', () => {
    expect(() => assertWorkbenchProvenance(sidecar({ provenance: { produced_at: 'x' } }))).toThrow(
      /provenance.producer/,
    );
  });

  it('refuses a sidecar missing dims (schema error surfaces, not swallowed)', () => {
    expect(() => assertWorkbenchProvenance(sidecar({ dims: undefined }))).toThrow(
      /dims must be 3 finite numbers/,
    );
  });

  it('refuses a sidecar with the wrong format tag', () => {
    expect(() => assertWorkbenchProvenance(sidecar({ format: 'not-polyphy-trace' }))).toThrow(
      /is not "polyphy-trace"/,
    );
  });
});
