/**
 * label2DDirector — far-star caption/leader-line stability at Earth zoom.
 *
 * The user report: zoomed all the way to Earth (cam.distance ~1e-13 Mpc), the
 * caption and leader line of a FAR famous star (VY Canis Majoris at ~1170 pc)
 * flicker/jump frame to frame. The diagnosis is POSITIONAL: the star anchor
 * sits ~1e-3 Mpc out — tens of millions of times BEYOND the NEAR0 far plane
 * (which floors at `FAR_MIN_MPC = 3e-11` on a deep descent). The director's
 * lift stage un-projects through the INVERSE of the ill-conditioned NEAR0 vp;
 * for an anchor that far past the far plane `ndc_z ≈ 1.0` to within f64
 * round-off, so the inverse's huge depth-row elements amplify residual error
 * and the un-projected point (the drawn caption world position AND both
 * leader-line endpoints) shifts every frame as the camera — hence the
 * matrix — moves.
 *
 * Moved from `foregroundLabelsLayer.test.ts` (spec §5.2): the lift stage this
 * regression guards now lives in `label2DDirector.ts`'s `applyLift`, driven
 * here through the REAL `produceSceneBodyCaptions` producer and a REAL
 * Earth-zoom NEAR0 frustum, so the ill-conditioning is genuine. The fix
 * clamps the anchor handed to the lift to just inside the far plane
 * (direction-preserving, in the camera-relative frame, so the on-screen
 * position is unchanged) — mirroring `near0SelectionRingLayer`'s ring-clip
 * clamp. After the fix the un-projected geometry lands inside the
 * well-conditioned part of the frustum, so it is stable frame-to-frame and
 * bounded by the far plane.
 */

import { describe, it, expect, vi } from 'vitest';

import { createLabel2DDirector } from '../../../../src/services/engine/subsystems/label2DDirector';
import { FOREGROUND_LABEL_DIRECTOR } from '../../../../src/data/labels/foregroundLabelDirectorConfig';
import { produceSceneBodyCaptions } from '../../../../src/services/engine/presentation/produceSceneBodyCaptions';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import {
  sceneBodyLabels,
  sceneBodyLabelId,
  SCENE_STAR_LABEL_IDS,
} from '../../../../src/services/engine/presentation/sceneBodyLabels';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { computeForegroundViewProj } from '../../../../src/utils/camera/computeForegroundViewProj';
import { foregroundFrustum } from '../../../../src/utils/camera/foregroundFrustum';
import { rebaseViewProj } from '../../../../src/utils/camera/rebaseViewProj';
import { makeBodyItems } from '../../../fixtures/makeBodyItems';

import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { LabelRenderer } from '../../../../src/@types/rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../../../src/@types/rendering/MarkerLineRenderer';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { MarkerLine } from '../../../../src/@types/rendering/MarkerLine';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const SUN_LABEL_ID = sceneBodyLabelId('sun');
const J2000_STATES = deriveBodyStates(CONST_J2000);

function makeLabelStub(): LabelRenderer {
  return {
    label: 'foregroundLabelRenderer',
    setLabels: vi.fn<(labels: readonly Label2D[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    measure: vi.fn<() => null>(() => null),
    glyphCount: () => 0,
    labelCount: () => 0,
    destroy: vi.fn(),
  } as unknown as LabelRenderer;
}

function makeLineStub(): MarkerLineRenderer {
  return {
    label: 'foregroundMarkerLineRenderer',
    setLines: vi.fn<(lines: MarkerLine[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    lineCount: () => 0,
    destroy: vi.fn(),
  } as unknown as MarkerLineRenderer;
}

function makeState(): EngineState {
  return {
    settings: {
      labels: { focusedOnly: false },
      bodies: { items: makeBodyItems() },
      starCatalogs: { enabled: true, items: { famousStar: { enabled: true, labelEnabled: true } } },
    },
    // Fail-safe pass-throughs (the real registry's unregistered-id default,
    // the real clip player's no-clip-playing default): every row here is
    // already `labelEnabled: true`, so these leave `produceSceneBodyCaptions`'s
    // composition unchanged from its pre-fade-wire value — this fixture is
    // about the ill-conditioned-projection regression, not the fade channels.
    subsystems: {
      fades: { opacityOf: () => 1 },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

/**
 * A REAL Earth-zoom NEAR0 frustum + slab: the vp is the genuine
 * ill-conditioned foreground projection at cam.distance 1e-13 Mpc (near
 * floored at MIN_NEAR_MPC, far floored at FAR_MIN_MPC = 3e-11). The camera
 * sits at `eye`, aims at `target`, so a body placed at `target` projects to
 * screen centre and is unambiguously in front of the camera.
 */
function makeRealNear0Slab(eye: Vec3, target: Vec3): Slab {
  const { near, far } = foregroundFrustum(1e-13);
  const vp = computeForegroundViewProj({
    eyeMpc: eye,
    targetMpc: target,
    up: [0, 1, 0],
    renderOrigin: RENDER_ORIGIN_MPC,
    fovYRad: 1,
    aspect: 1280 / 720,
    near,
    far,
    reversedZ: false,
  });
  return {
    index: NEAR0,
    near: near,
    far: far,
    vp,
    frame: { kind: 'world-mpc', originRelative: true },
    distanceRangeM: [near * SCALE_UNITS.MPC_TO_M, far * SCALE_UNITS.MPC_TO_M],
    precision: 'f64',
    reversedZ: false,
  };
}

function makeCtx(eye: Vec3, slab: Slab): ReadyFrameContext {
  return {
    slabs: [slab],
    drawCamPos: eye,
    canvasSize: { width: 1280, height: 720 },
    cam: { distance: 1e-13 },
    fovYRad: 1,
    nowMs: 0,
    simDays: CONST_J2000,
  } as unknown as ReadyFrameContext;
}

// The farthest star still inside the star-caption full-alpha band, seen from
// Earth — the most ill-conditioned caption that still emits at alpha 1. This
// is the class the user saw flicker (VY CMa at ~1170 pc; the roster's Eta
// Carinae at ~2300 pc is farther still). Deriving it from the seed keeps the
// test anchored to real data, not a magic id.
function farVisibleStar(): { id: string; worldPos: Vec3; distPc: number } {
  const base = sceneBodyLabels(J2000_STATES);
  const earth = base.find((l) => l.id === sceneBodyLabelId('earth'))!;
  const cam = earth.worldPos;
  const stars = base
    .filter((l) => SCENE_STAR_LABEL_IDS.has(l.id) && l.id !== SUN_LABEL_ID)
    .map((l) => ({
      id: l.id,
      worldPos: [...l.worldPos] as Vec3,
      distPc:
        Math.hypot(l.worldPos[0] - cam[0], l.worldPos[1] - cam[1], l.worldPos[2] - cam[2]) /
        SCALE_UNITS.PC_TO_MPC,
    }))
    .filter((s) => s.distPc <= SCALE_FADE_BANDS.starCaption.fullAt);
  return stars.reduce((a, b) => (b.distPc > a.distPc ? b : a));
}

function emittedLine(lineStub: MarkerLineRenderer, starId: string): MarkerLine | undefined {
  const spy = lineStub.setLines as unknown as ReturnType<typeof vi.fn>;
  const lines = spy.mock.calls.at(-1)![0] as MarkerLine[];
  return lines.find((l) => l.id === `${starId}-anchor`);
}
function emittedCaption(labelStub: LabelRenderer, starId: string): Label2D | undefined {
  const spy = labelStub.setLabels as unknown as ReturnType<typeof vi.fn>;
  const labels = spy.mock.calls.at(-1)![0] as readonly Label2D[];
  return labels.find((l) => l.id === starId);
}

describe('label2DDirector — far-star caption/leader stability at Earth zoom', () => {
  it('keeps a far star caption + leader endpoints stable under a sub-parsec camera nudge', () => {
    const star = farVisibleStar();
    const base = sceneBodyLabels(J2000_STATES);
    const earth = base.find((l) => l.id === sceneBodyLabelId('earth'))!;
    const eyeA: Vec3 = [...earth.worldPos] as Vec3;
    // Orbit step ~1e-15 Mpc — a fraction of a metre at 1 AU, well below one
    // rendered pixel. The caption must not visibly hop for a nudge this small.
    const eyeB: Vec3 = [eyeA[0] + 1e-15, eyeA[1], eyeA[2]];

    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
    dir.attachRenderers(labelStub, lineStub);
    dir.registerProducer({ id: 'sceneBodyCaptions', produceLabels: produceSceneBodyCaptions });
    const state = makeState();

    dir.runFrame(state, makeCtx(eyeA, makeRealNear0Slab(eyeA, star.worldPos)));
    const capA = emittedCaption(labelStub, star.id);
    const lineA = emittedLine(lineStub, star.id);
    expect(capA, `far star ${star.id} (${star.distPc.toFixed(0)} pc) should emit`).toBeDefined();
    expect(lineA).toBeDefined();

    dir.runFrame(state, makeCtx(eyeB, makeRealNear0Slab(eyeB, star.worldPos)));
    const capB = emittedCaption(labelStub, star.id);
    const lineB = emittedLine(lineStub, star.id);
    expect(capB).toBeDefined();
    expect(lineB).toBeDefined();

    const dist = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const capJump = dist(capA!.worldPos as Vec3, capB!.worldPos as Vec3);
    const toJump = dist(lineA!.toWorld as Vec3, lineB!.toWorld as Vec3);
    const fromJump = dist(lineA!.fromWorld as Vec3, lineB!.fromWorld as Vec3);

    // The camera moved 1e-15 Mpc; a stable caption's world anchor may only
    // shift on that order. The un-clamped inverse amplifies it by many orders
    // of magnitude (the flicker). The far plane is 3e-11 Mpc, so any legitimate
    // in-frustum jitter is a tiny fraction of that; 1e-13 gives generous room
    // above the honest sub-nudge motion while still catching the bug.
    const EPS = 1e-13;
    expect(capJump, `caption worldPos jumped ${capJump}`).toBeLessThan(EPS);
    expect(toJump, `leader toWorld jumped ${toJump}`).toBeLessThan(EPS);
    expect(fromJump, `leader fromWorld jumped ${fromJump}`).toBeLessThan(EPS);
  });

  it('bounds the lifted caption + leader endpoints inside the NEAR0 far plane', () => {
    const star = farVisibleStar();
    const base = sceneBodyLabels(J2000_STATES);
    const earth = base.find((l) => l.id === sceneBodyLabelId('earth'))!;
    const eye: Vec3 = [...earth.worldPos] as Vec3;
    const slab = makeRealNear0Slab(eye, star.worldPos);

    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
    dir.attachRenderers(labelStub, lineStub);
    dir.registerProducer({ id: 'sceneBodyCaptions', produceLabels: produceSceneBodyCaptions });
    dir.runFrame(makeState(), makeCtx(eye, slab));

    const cap = emittedCaption(labelStub, star.id);
    const line = emittedLine(lineStub, star.id);
    expect(cap).toBeDefined();
    expect(line).toBeDefined();

    const len = (p: Vec3) => Math.hypot(p[0], p[1], p[2]);
    const farMpc = slab.far;
    // The lifted geometry is derived from the anchor pulled to just inside the
    // far plane, so — camera at the origin of the rebased frame — every point
    // sits within the far plane. Before the clamp these lengths are the raw
    // anchor distance (~1e-3 Mpc), tens of millions of times past the plane.
    expect(len(cap!.worldPos as Vec3), 'caption beyond far plane').toBeLessThanOrEqual(farMpc);
    expect(len(line!.toWorld as Vec3), 'leader top beyond far plane').toBeLessThanOrEqual(farMpc);
    expect(len(line!.fromWorld as Vec3), 'leader bottom beyond far plane').toBeLessThanOrEqual(
      farMpc,
    );
  });

  it('draws the far-star caption at the SAME apparent px size as its true-depth projection', () => {
    // The clamp moves the DRAWN anchor ~4e7× closer than the star really is,
    // but the label shader sizes glyphs from the drawn anchor's clip-w:
    // pxPerEm = worldEmMpc / clipW · viewportH/2, clamped to [min, max]px
    // (labels/vertex.wesl, mirrored by `label2DDirector`'s `applyLift`). If the
    // emitted caption keeps the star's PHYSICAL worldEmMpc while its position
    // sits at the clamped depth, the projected em inflates by exactly the
    // clamp ratio — a sub-pixel star that should render at the 30px floor
    // slams into the 150px ceiling. The fix scales the emitted worldEmMpc by
    // the same ratio, so em/clipW — hence the drawn px size — matches the
    // true-depth value.
    const star = farVisibleStar();
    const base = sceneBodyLabels(J2000_STATES);
    const earth = base.find((l) => l.id === sceneBodyLabelId('earth'))!;
    const trueLabel = base.find((l) => l.id === star.id)!;
    const eye: Vec3 = [...earth.worldPos] as Vec3;
    const slab = makeRealNear0Slab(eye, star.worldPos);

    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
    dir.attachRenderers(labelStub, lineStub);
    dir.registerProducer({ id: 'sceneBodyCaptions', produceLabels: produceSceneBodyCaptions });
    dir.runFrame(makeState(), makeCtx(eye, slab));
    const cap = emittedCaption(labelStub, star.id)!;
    expect(cap).toBeDefined();

    // Replicate the shader's sizing at the DRAWN anchor: project through the
    // same rebased vp the director's lift draws with (the lift preserves the
    // dot's clip-w, so the lifted label anchor carries the dot's depth).
    const vp = rebaseViewProj(slab.vp, eye);
    const clipW = (p: Vec3) => vp[3]! * p[0] + vp[7]! * p[1] + vp[11]! * p[2] + vp[15]!;
    const viewportH = 720;
    const shaderPx = (emMpc: number, w: number) =>
      Math.min(Math.max((emMpc / w) * (viewportH * 0.5), cap.minPixelSize!), cap.maxPixelSize!);

    const drawnPx = shaderPx(cap.worldEmMpc!, clipW(cap.worldPos as Vec3));

    // The intended size: the same shader math at the star's TRUE camera-relative
    // depth with its physical em — what an un-clamped (stable) pipeline would
    // have drawn. For a ~1000pc star the physical em is deeply sub-pixel, so
    // this lands on the minPixelSize floor.
    const trueAnchor: Vec3 = [
      star.worldPos[0] - eye[0],
      star.worldPos[1] - eye[1],
      star.worldPos[2] - eye[2],
    ];
    const intendedPx = shaderPx(trueLabel.worldEmMpc, clipW(trueAnchor));

    // 1% tolerance: the clamp ratio cancels algebraically, so the only slack
    // needed is f64 round-off — a drawn size at the 150px ceiling instead of
    // the 30px floor fails by 5×.
    expect(
      Math.abs(drawnPx - intendedPx) / intendedPx,
      `drawn ${drawnPx}px vs intended ${intendedPx}px (inflation ×${(drawnPx / intendedPx).toFixed(2)})`,
    ).toBeLessThan(0.01);
  });
});
