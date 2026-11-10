import { describe, expect, it } from 'vitest';
import { composeForegroundCaption } from '../../../src/utils/labels/composeForegroundCaption';
import type { CaptionComposeContext } from '../../../src/@types/rendering/CaptionComposeContext';
import type { FocusUniformsValue } from '../../../src/@types/rendering/FocusUniformsValue';
import type { ForegroundCaption } from '../../../src/services/engine/presentation/foregroundCaption';
import { CAPTION_PRIORITY_SCALE } from '../../../src/data/labels/captionPriorityScale';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { ZERO_FOCUS } from '../../../src/services/engine/subsystems/recedingFocusSubsystem';

const ctxWith = (focus: FocusUniformsValue): CaptionComposeContext => ({
  camPos: [0, 0, 0],
  viewportShortSidePx: 1000,
  drawPxPerRad: 1000,
  focus,
  occluders: [],
});

const caption: ForegroundCaption = {
  id: 'c',
  priority: 5,
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
    expect(out.subjectId).toBe(7);
    expect(out.text).toBe('x');
  });
});

describe('composeForegroundCaption handed value', () => {
  const earthCaption: ForegroundCaption = { ...caption, id: 'e' };
  const atFullBlend = ctxWith({
    center: [1e-3, 0, 0],
    apparentRadiusMpc: 1e-5,
    physicalRadiusMpc: 5e-6,
    blend: 1,
  });

  it('scales by the handed value exactly once', () => {
    // Against the unfocused value-1 case: a recession the compose applied itself would
    // scale both focused calls alike, so a focused reference could not see it.
    const atRest = composeForegroundCaption(ctxWith(ZERO_FOCUS), earthCaption, 1).fadeAlpha!;
    const handed = composeForegroundCaption(atFullBlend, earthCaption, 0.25).fadeAlpha!;
    expect(atRest).toBeGreaterThan(0);
    expect(handed).toBeCloseTo(atRest * 0.25, 10);
  });
});

describe('composeForegroundCaption declutter priority', () => {
  it('scores a huge subject below a tiny one at the next priority up', () => {
    // An em ten times the 1e-3 Mpc distance at 1000 px/rad: 20,000 px, past the scale.
    const huge: ForegroundCaption = { ...caption, priority: 5, worldEmMpc: 1e-2 };
    const tiny: ForegroundCaption = { ...caption, priority: 6, worldEmMpc: 1e-20 };
    const ctx = ctxWith(ZERO_FOCUS);
    const hugeScore = composeForegroundCaption(ctx, huge, 1).declutterPriority!;
    const tinyScore = composeForegroundCaption(ctx, tiny, 1).declutterPriority!;
    expect(hugeScore).toBeLessThan(tinyScore);
    // Against a score that ignores size altogether, which would pass the line above.
    expect(hugeScore).toBeGreaterThan(5 * CAPTION_PRIORITY_SCALE);
  });
});

describe('composeForegroundCaption scene-depth cutoff', () => {
  // worldEm 1e-6 Mpc at 1e-3 Mpc with 1000 px/rad: a 2 px subject.
  const resolved = caption;
  // A rover on its host's ground, ~1e-5 px: far under the terrain texel that
  // would be asked whether it hides it.
  const rover: ForegroundCaption = {
    ...caption,
    worldPos: [1e-12, 0, 0],
    worldEmMpc: 1e-20,
  };
  // A star 0.002 px across, a megaparsec past that ground.
  const star: ForegroundCaption = { ...caption, worldPos: [1, 0, 0] };
  // The host's centre stands one datum radius past the rover, its relief band spanning it.
  const datumM = 1e-12 * SCALE_UNITS.MPC_TO_M;
  const onHost: CaptionComposeContext = {
    ...ctxWith(ZERO_FOCUS),
    occluders: [{ positionMpc: [2e-12, 0, 0], radiusM: datumM - 5e3, outerRadiusM: datumM + 5e3 }],
  };

  it('asks the sampled depth of a subject spanning a pixel', () => {
    expect(composeForegroundCaption(onHost, resolved, 1).occludeNearKm).toBeGreaterThan(0);
  });

  it("skips the sampled depth of a sub-pixel subject inside a body's relief band", () => {
    expect(composeForegroundCaption(onHost, rover, 1).occludeNearKm).toBeLessThan(0);
  });

  it('asks the sampled depth of a sub-pixel subject off every ground, so terrain hides a star', () => {
    expect(composeForegroundCaption(onHost, star, 1).occludeNearKm).toBeGreaterThan(0);
  });
});
