/**
 * produceZoneOfAvoidanceLettering — placement identity (no constant
 * restatement), labelColor pass-through, and fadeAlpha pass-through from
 * deriveZoneOfAvoidanceLiveness.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/services/engine/frame/zoneOfAvoidanceLiveness', () => ({
  deriveZoneOfAvoidanceLiveness: vi.fn(),
}));

import { produceZoneOfAvoidanceLettering } from '../../../../src/services/engine/presentation/produceZoneOfAvoidanceLettering';
import { deriveZoneOfAvoidanceLiveness } from '../../../../src/services/engine/frame/zoneOfAvoidanceLiveness';
import { GAL_X_EQ, GAL_Z_EQ } from '../../../../src/data/orientation/orientationFrames';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

function makeState(): EngineState {
  return {
    settings: { zoneOfAvoidance: { labelColor: [1, 0.5, 0.2] } },
  } as unknown as EngineState;
}
const CTX = {} as ReadyFrameContext;

describe('produceZoneOfAvoidanceLettering', () => {
  it('places the lettering on the galactic plane', () => {
    vi.mocked(deriveZoneOfAvoidanceLiveness).mockReturnValue(1);
    const out = produceZoneOfAvoidanceLettering(makeState(), CTX);
    expect(out.labels).toHaveLength(1);
    const placement = out.labels[0]!.placement;
    expect(placement.planeNormal).toBe(GAL_Z_EQ);
    expect(placement.referenceDir).toBe(GAL_X_EQ);
    // Pins the read to `labelColor` specifically — `tuning.color` (the
    // band's colour) lives on the same settings object and is a reachable
    // mistake to read instead.
    expect(out.labels[0]!.color).toEqual([1, 0.5, 0.2, 1]);
  });

  it('fadeAlpha tracks deriveZoneOfAvoidanceLiveness', () => {
    vi.mocked(deriveZoneOfAvoidanceLiveness).mockReturnValue(null);
    expect(produceZoneOfAvoidanceLettering(makeState(), CTX).labels).toEqual([]);

    vi.mocked(deriveZoneOfAvoidanceLiveness).mockReturnValue(0.3);
    const out = produceZoneOfAvoidanceLettering(makeState(), CTX);
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0]!.fadeAlpha).toBe(0.3);
  });
});
