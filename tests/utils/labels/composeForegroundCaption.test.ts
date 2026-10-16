import { describe, expect, it } from 'vitest';
import { composeForegroundCaption } from '../../../src/utils/labels/composeForegroundCaption';
import type { CaptionComposeContext } from '../../../src/@types/rendering/CaptionComposeContext';
import type { FocusUniformsValue } from '../../../src/@types/rendering/FocusUniformsValue';
import type { ForegroundCaption } from '../../../src/services/engine/presentation/foregroundCaption';
import { ZERO_FOCUS } from '../../../src/services/engine/subsystems/structureFocusSubsystem';

const ctxWith = (focus: FocusUniformsValue): CaptionComposeContext => ({
  camPos: [0, 0, 0],
  camOrbitDistanceMpc: 1e-3,
  viewportShortSidePx: 1000,
  drawPxPerRad: 1000,
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

describe('composeForegroundCaption handed value', () => {
  // 'earth' rides the solar-system reach band (on inside it), so its target is a clean 1.
  const earthCaption: ForegroundCaption = { ...caption, id: 'e', kind: 'earth' };
  const atFullBlend = ctxWith({
    center: [1e-3, 0, 0],
    apparentRadiusMpc: 1e-5,
    physicalRadiusMpc: 5e-6,
    blend: 1,
  });

  it('recedes once: a handed 0.25 (full fade x MILD at blend 1) scales fadeAlpha by exactly 0.25', () => {
    // Against the unfocused value-1 case: a recession the compose applied itself would
    // scale both focused calls alike, so a focused reference could not see it.
    const atRest = composeForegroundCaption(ctxWith(ZERO_FOCUS), earthCaption, 1).fadeAlpha!;
    const handed = composeForegroundCaption(atFullBlend, earthCaption, 0.25).fadeAlpha!;
    expect(atRest).toBeGreaterThan(0);
    expect(handed).toBeCloseTo(atRest * 0.25, 10);
  });
});
