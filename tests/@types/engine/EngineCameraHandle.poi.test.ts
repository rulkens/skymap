import { describe, it, expect } from 'vitest';
import type { EngineCameraHandle } from '../../../src/@types/engine/handles/EngineCameraHandle';
import type { PointOfInterest } from '../../../src/@types/engine/subsystems/PointOfInterest';

describe('EngineCameraHandle.focusOnPoi', () => {
  it('exists and accepts a PointOfInterest', () => {
    const _stub: Pick<EngineCameraHandle, 'focusOnPoi'> = {
      focusOnPoi: (poi: PointOfInterest): void => void poi,
    };
    expect(_stub.focusOnPoi).toBeTypeOf('function');
  });
});
