import { describe, expect, it } from 'vitest';
import { composeForegroundCaption } from '../../../src/utils/labels/composeForegroundCaption';
import type { CaptionComposeContext } from '../../../src/@types/rendering/CaptionComposeContext';
import type { FocusUniformsValue } from '../../../src/@types/rendering/FocusUniformsValue';
import type { ForegroundCaption } from '../../../src/services/engine/presentation/foregroundCaption';
import { ZERO_FOCUS } from '../../../src/services/engine/subsystems/structureFocusSubsystem';

// 'constellation' reads no registry handle and no settings, so the stubs stay inert.
const ctxWith = (focus: FocusUniformsValue): CaptionComposeContext => ({
  settings: {} as never,
  camPos: [0, 0, 0],
  camOrbitDistanceMpc: 1e-3,
  viewportShortSidePx: 1000,
  drawPxPerRad: 1000,
  fades: {} as never,
  nowMs: 0,
  focus,
  occluders: [],
});

const caption: ForegroundCaption = {
  id: 'c',
  kind: 'constellation',
  text: 'x',
  font: 'cormorant',
  pixelSize: 10,
  worldPos: [1e-3, 0, 0],
  worldEmMpc: 1e-6,
  color: [1, 1, 1, 1],
  minPixelSize: 8,
  maxPixelSize: 20,
  pickId: 7,
};

describe('composeForegroundCaption pick under focus', () => {
  const sphereAt = (center: [number, number, number]): FocusUniformsValue => ({
    center,
    apparentRadiusMpc: 1e-5,
    physicalRadiusMpc: 5e-6,
    blend: 1,
  });

  it('keeps the pick at rest and inside the focused sphere', () => {
    expect(composeForegroundCaption(ctxWith(ZERO_FOCUS), caption, 1).pickId).toBe(7);
    expect(composeForegroundCaption(ctxWith(sphereAt([1e-3, 0, 0])), caption, 1).pickId).toBe(7);
  });

  it('draws the caption but strips its pick outside the focused sphere', () => {
    const out = composeForegroundCaption(ctxWith(sphereAt([0.5, 0, 0])), caption, 1);
    expect(out.pickId).toBeUndefined();
    expect(out.text).toBe('x');
  });
});
