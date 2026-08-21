/**
 * foregroundLabelsLayer — far-star caption/leader-line stability at Earth zoom.
 *
 * The user report: zoomed all the way to Earth (cam.distance ~1e-13 Mpc), the
 * caption and leader line of a FAR famous star (VY Canis Majoris at ~1170 pc)
 * flicker/jump frame to frame. The diagnosis is POSITIONAL: the star anchor
 * sits ~1e-3 Mpc out — tens of millions of times BEYOND the NEAR0 far plane
 * (which floors at `FAR_MIN_MPC = 3e-11` on a deep descent). The lifted-label
 * chain un-projects through the INVERSE of the ill-conditioned NEAR0 vp; for an
 * anchor that far past the far plane `ndc_z ≈ 1.0` to within f64 round-off, so
 * the inverse's huge depth-row elements amplify residual error and the
 * un-projected point (the drawn caption world position AND both leader-line
 * endpoints) shifts every frame as the camera — hence the matrix — moves.
 *
 * These tests exercise the REAL rebase + inverse path (no `rebaseViewProj`
 * mock, unlike the sibling suite) against a REAL Earth-zoom NEAR0 frustum, so
 * the ill-conditioning is genuine. The fix clamps the anchor handed to the lift
 * to just inside the far plane (direction-preserving, in the camera-relative
 * frame, so the on-screen position is unchanged) — mirroring
 * `near0SelectionRingLayer`'s ring-clip clamp. After the fix the un-projected
 * geometry lands inside the well-conditioned part of the frustum, so it is
 * stable frame-to-frame and bounded by the far plane.
 */

import { describe, it, expect, vi } from 'vitest';

import { foregroundLabelsLayer } from '../../../../../src/services/engine/frame/passes/foregroundLabelsLayer';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import {
  sceneBodyLabels,
  sceneBodyLabelId,
  SCENE_STAR_LABEL_IDS,
} from '../../../../../src/services/engine/presentation/sceneBodyLabels';
import { SCALE_FADE_BANDS } from '../../../../../src/services/engine/presentation/scaleFadeBands';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { computeForegroundViewProj } from '../../../../../src/utils/camera/computeForegroundViewProj';
import { foregroundFrustum } from '../../../../../src/utils/camera/foregroundFrustum';
import { rebaseViewProj } from '../../../../../src/utils/camera/rebaseViewProj';
import { makeBodyItems } from '../../../../fixtures/makeBodyItems';

import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { LabelRenderer } from '../../../../../src/@types/rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../../../../src/@types/rendering/MarkerLineRenderer';
import type { Label2D } from '../../../../../src/@types/rendering/Label2D';
import type { MarkerLine } from '../../../../../src/@types/rendering/MarkerLine';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const PASS_STUB = { draw: vi.fn() } as unknown as GPURenderPassEncoder;
const SUN_LABEL_ID = sceneBodyLabelId('sun');

// The layer derives captions from the frame's body snapshot at ctx.simDays;
// these geometry tests pin it at J2000 so the anchors match J2000_STATES.
const J2000_STATES = deriveBodyStates(CONST_J2000);

function makeRenderer(): LabelRenderer {
  return {
    label: 'foregroundLabelRenderer',
    setLabels: vi.fn<(labels: readonly Label2D[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    measure: vi.fn<() => null>(() => null),
    glyphCount: () => 6,
  } as unknown as LabelRenderer;
}

function makeLineRenderer(): MarkerLineRenderer {
  return {
    label: 'foregroundMarkerLineRenderer',
    setLines: vi.fn<(lines: MarkerLine[]) => void>(),
    draw: vi.fn<(...args: unknown[]) => void>(),
    lineCount: () => 0,
    destroy: vi.fn<() => void>(),
  } as unknown as MarkerLineRenderer;
}

function makeState(renderer: LabelRenderer, lineRenderer: MarkerLineRenderer): EngineState {
  return {
    gpu: { foregroundLabelRenderer: renderer, foregroundMarkerLineRenderer: lineRenderer },
    settings: {
      labels: { focusedOnly: false },
      bodies: { items: makeBodyItems() },
      starCatalogs: { enabled: true, items: { famousStar: { enabled: true, labelEnabled: true } } },
    },
    // No constellation slot: these tests exercise only the far-star body-caption
    // lift, so the layer reads an empty figure-name set and skips its toggle +
    // fade reads. The key must exist (the layer reads `.constellations`).
    assetSlots: { constellations: null },
    subsystems: { scheduler: { requestRender: vi.fn<() => void>() } },
  } as unknown as EngineState;
}

let clockMs = 0;
function makeCtx(): ReadyFrameContext {
  // Advance the clock a full minute per frame so the caption alpha envelope
  // (module state) settles exactly on its target — positions are pure geometry
  // regardless, but this keeps the emit set stable across frames.
  clockMs += 60_000;
  // The layer reads `ctx.renderTargets.depthViewOf('foreground:0')` for the
  // caption/connector occlusion pass, gated on `renderedTargets.has('foreground:0')`
  // (the body pass ran this frame); a no-op depth stub plus `foreground:0` in the
  // rendered set keep these geometry tests from throwing on that seam.
  return {
    cam: { distance: 1e-13 },
    fovYRad: 1,
    nowMs: clockMs,
    simDays: CONST_J2000,
    renderTargets: { depthViewOf: () => ({}) as GPUTextureView },
    renderedTargets: new Set(['foreground:0']),
  } as unknown as ReadyFrameContext;
}

/**
 * A REAL Earth-zoom NEAR0 SlabView: the vp is the genuine ill-conditioned
 * foreground projection at cam.distance 1e-13 Mpc (near floored at MIN_NEAR_MPC,
 * far floored at FAR_MIN_MPC = 3e-11). The camera sits at `eye`, aims at
 * `target`, so a body placed at `target` projects to screen centre and is
 * unambiguously in front of the camera.
 */
function makeRealNear0View(eye: Vec3, target: Vec3): SlabView {
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
  const slab: Slab = {
    index: NEAR0,
    nearMpc: near,
    farMpc: far,
    vp,
    originRelative: true,
    precision: 'f64',
    reversedZ: false,
  };
  return {
    slab,
    vp: Float32Array.from(vp),
    camPos: eye,
    viewportPx: [1280, 720],
  };
}

// The farthest star still inside the star-caption full-alpha band, seen from
// Earth — the most ill-conditioned caption that still emits at alpha 1. This is
// the class the user saw flicker (VY CMa at ~1170 pc; the roster's Eta Carinae
// at ~2300 pc is farther still). Deriving it from the seed keeps the test
// anchored to real data, not a magic id.
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

function emittedLine(lineRenderer: MarkerLineRenderer, starId: string): MarkerLine | undefined {
  const spy = lineRenderer.setLines as unknown as ReturnType<typeof vi.fn>;
  const lines = spy.mock.calls.at(-1)![0] as MarkerLine[];
  return lines.find((l) => l.id === `${starId}-anchor`);
}
function emittedCaption(renderer: LabelRenderer, starId: string): Label2D | undefined {
  const spy = renderer.setLabels as unknown as ReturnType<typeof vi.fn>;
  const labels = spy.mock.calls.at(-1)![0] as readonly Label2D[];
  return labels.find((l) => l.id === starId);
}

describe('foregroundLabelsLayer — far-star caption/leader stability at Earth zoom', () => {
  it('keeps a far star caption + leader endpoints stable under a sub-parsec camera nudge', () => {
    const star = farVisibleStar();
    const base = sceneBodyLabels(J2000_STATES);
    const earth = base.find((l) => l.id === sceneBodyLabelId('earth'))!;
    const eyeA: Vec3 = [...earth.worldPos] as Vec3;
    // Orbit step ~1e-15 Mpc — a fraction of a metre at 1 AU, well below one
    // rendered pixel. The caption must not visibly hop for a nudge this small.
    const eyeB: Vec3 = [eyeA[0] + 1e-15, eyeA[1], eyeA[2]];

    const renderer = makeRenderer();
    const lineRenderer = makeLineRenderer();
    const state = makeState(renderer, lineRenderer);

    foregroundLabelsLayer.draw(PASS_STUB, makeRealNear0View(eyeA, star.worldPos), makeCtx(), state);
    const capA = emittedCaption(renderer, star.id);
    const lineA = emittedLine(lineRenderer, star.id);
    expect(capA, `far star ${star.id} (${star.distPc.toFixed(0)} pc) should emit`).toBeDefined();
    expect(lineA).toBeDefined();

    foregroundLabelsLayer.draw(PASS_STUB, makeRealNear0View(eyeB, star.worldPos), makeCtx(), state);
    const capB = emittedCaption(renderer, star.id);
    const lineB = emittedLine(lineRenderer, star.id);
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
    const view = makeRealNear0View(eye, star.worldPos);

    const renderer = makeRenderer();
    const lineRenderer = makeLineRenderer();
    foregroundLabelsLayer.draw(PASS_STUB, view, makeCtx(), makeState(renderer, lineRenderer));

    const cap = emittedCaption(renderer, star.id);
    const line = emittedLine(lineRenderer, star.id);
    expect(cap).toBeDefined();
    expect(line).toBeDefined();

    const len = (p: Vec3) => Math.hypot(p[0], p[1], p[2]);
    const farMpc = view.slab.farMpc;
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
    // (labels/vertex.wesl, mirrored by liftedLabelPlacement). If the emitted
    // caption keeps the star's PHYSICAL worldEmMpc while its position sits at
    // the clamped depth, the projected em inflates by exactly the clamp ratio —
    // a sub-pixel star that should render at the 30px floor slams into the
    // 150px ceiling. The fix scales the emitted worldEmMpc by the same ratio,
    // so em/clipW — hence the drawn px size — matches the true-depth value.
    const star = farVisibleStar();
    const base = sceneBodyLabels(J2000_STATES);
    const earth = base.find((l) => l.id === sceneBodyLabelId('earth'))!;
    const trueLabel = base.find((l) => l.id === star.id)!;
    const eye: Vec3 = [...earth.worldPos] as Vec3;
    const view = makeRealNear0View(eye, star.worldPos);

    const renderer = makeRenderer();
    const lineRenderer = makeLineRenderer();
    foregroundLabelsLayer.draw(PASS_STUB, view, makeCtx(), makeState(renderer, lineRenderer));
    const cap = emittedCaption(renderer, star.id)!;
    expect(cap).toBeDefined();

    // Replicate the shader's sizing at the DRAWN anchor: project through the
    // same rebased vp the layer draws with (the lift preserves the dot's
    // clip-w, so the lifted label anchor carries the dot's depth).
    const vp = rebaseViewProj(view.slab.vp, eye);
    const clipW = (p: Vec3) => vp[3]! * p[0] + vp[7]! * p[1] + vp[11]! * p[2] + vp[15]!;
    const viewportH = view.viewportPx[1];
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
