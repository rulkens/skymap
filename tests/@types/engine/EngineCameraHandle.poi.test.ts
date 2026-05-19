import { describe, it, expect } from 'vitest';
import type { EngineCameraHandle } from '../../../src/@types/engine/handles/EngineCameraHandle';
import type { PointOfInterest } from '../../../src/@types/engine/subsystems/PointOfInterest';

describe('EngineCameraHandle.focusOn (POI)', () => {
  it('accepts a PointOfInterest via the unified focusOn slot', () => {
    // Type-level assertion: the unified focusOn signature accepts both
    // GalaxyInfo and PointOfInterest (see FocusableTarget).  This test
    // pins the POI half of that contract; the galaxy half is implicit
    // in every existing handle consumer.
    const poi: PointOfInterest = {
      id: 'virgo-cluster',
      name: 'Virgo Cluster',
      category: 'cluster',
      worldPos: [0, 0, 0],
    };
    const _stub: Pick<EngineCameraHandle, 'focusOn'> = {
      focusOn: (target): void => void target,
    };
    _stub.focusOn(poi);
    expect(_stub.focusOn).toBeTypeOf('function');
  });
});
