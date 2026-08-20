import { describe, expect, it, vi } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import { produceMilkyWayLabel } from '../../../../src/services/engine/presentation/produceMilkyWayLabel';
import { MILKY_WAY_LABEL_STYLE } from '../../../../src/services/engine/presentation/milkyWayLabelStyle';
import { milkyWayLabelAlpha } from '../../../../src/services/gpu/labelLayout/milkyWayLabelVisibility';
import { fadeBand } from '../../../../src/utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import {
  LEADER_LINE_PADDING_PX,
  MIN_LABEL_CLEARANCE_PX,
} from '../../../../src/services/engine/presentation/leaderLineStyle';
import { ATLAS_FONT_SIZE } from '../../../../src/data/fonts';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Label } from '../../../../src/@types/rendering/Label';
import type { LabelBBox } from '../../../../src/@types/rendering/LabelBBox';

// Measured ink bbox the labelRenderer stub reports (atlas px, anchor-relative,
// +Y down). maxY = 12 puts the text's true bottom 12 atlas px below the
// baseline anchor (a descender — 'You are here' has one), which the producer
// scales by the em clamp to place the stem top.
const MEASURED_BBOX: LabelBBox = { minX: -60, minY: -40, maxX: 60, maxY: 12 };

// Screen offset of the text's true bottom BELOW the label anchor. At the
// fixture distances the projected em (worldEm/clipW · h/2 ≤ ~14 px) sits far
// below the style's minPixelSize (45), so the clamp pins displayEmPx there.
const TEXT_BOTTOM_BELOW_ANCHOR_PX =
  MEASURED_BBOX.maxY * (MILKY_WAY_LABEL_STYLE.minPixelSize / ATLAS_FONT_SIZE);

// Minimal state: the producer reads settings.milkyWay.labelEnabled,
// settings.labels.focusedOnly (+ selection.focus for the solo gate), the fade
// registry (opacityOf only — the producer is a pure reader), and
// state.gpu.labelRenderer.measure for the caption's ink bbox (which places
// the stem top).
function makeState(
  labelEnabled: boolean,
  layerOpacity: number,
  opts: { focusedOnly?: boolean; focus?: { type: string } | null; bbox?: LabelBBox } = {},
): EngineState {
  const bbox = opts.bbox ?? MEASURED_BBOX;
  return {
    settings: {
      milkyWay: { enabled: true, labelEnabled },
      labels: { focusedOnly: opts.focusedOnly ?? false },
    },
    selection: { focus: opts.focus ?? null, select: null, hover: null },
    gpu: { labelRenderer: { measure: vi.fn<(label: Label) => LabelBBox>(() => bbox) } },
    subsystems: {
      fades: {
        opacityOf: () => layerOpacity,
      },
      // resolveLayerOpacity's clip factor; no clip plays in these fixtures.
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

// The producer now projects the origin through ctx.vp for the screen-space
// lift, so the fixture carries a real view-projection: camera at
// [camDistMpc, 0, 0] looking at the origin, 60° vertical fov. `up` tilts the
// camera (roll) for the orientation-independence test; `height` shrinks the
// viewport until the lift leaves no room for a stem below the text.
function makeCtx(
  camDistMpc: number,
  opts: { up?: Vec3; width?: number; height?: number } = {},
): ReadyFrameContext {
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const fovYRad = (60 * Math.PI) / 180;
  const vp = mat4.multiply(
    mat4.perspective(fovYRad, width / height, 0.01, 100),
    mat4.lookAt([camDistMpc, 0, 0], [0, 0, 0], opts.up ?? [0, 1, 0]),
  );
  return {
    drawCamPos: [camDistMpc, 0, 0],
    vp,
    canvasSize: { width, height },
    fovYRad,
    nowMs: 0,
    // resolveLayerOpacity lerps its recession factor on this; an absent one
    // makes the composed alpha NaN.
    focusBlend: 0,
  } as unknown as ReadyFrameContext;
}

/** Project a world point through the ctx's vp to screen pixels (+Y down). */
function screenOf(ctx: ReadyFrameContext, p: readonly number[]): Vec2 {
  const m = ctx.vp;
  const clipX = m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!;
  const clipY = m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!;
  const clipW = m[3]! * p[0]! + m[7]! * p[1]! + m[11]! * p[2]! + m[15]!;
  const { width, height } = ctx.canvasSize;
  return [(clipX / clipW / 2 + 0.5) * width, (1 - (clipY / clipW / 2 + 0.5)) * height];
}

/**
 * The producer's PROPORTIONAL lift: 1.5 × apparent size of the MW's 30 kpc
 * disk. Only valid above the ink-clearance floor (MIN_LABEL_CLEARANCE_PX +
 * the measured ink drop) — callers in the floored regime assert against the
 * constants instead.
 */
function expectedLiftPx(camDistMpc: number, viewportHeightPx: number): number {
  const pxPerRad = viewportHeightPx / (2 * Math.tan((30 * Math.PI) / 180));
  return 1.5 * (30 / (camDistMpc * 1000)) * pxPerRad;
}

// The producer composes fadeAlpha = milkyWayLabelAlpha(dist) ·
// fadeBand(surveyDeepZoom, dist) · layerOpacity. The surveyDeepZoom band's FULL
// edge tracks FOREGROUND_MAX_DISTANCE_MPC, which the famous-stars seed roster
// grows (Deneb at 802 pc now pushes the gate to ~0.8 Mpc, above the Milky-Way
// label's 0.6 Mpc near band). So the distance fade at a fixed camera distance is
// DERIVED here rather than pinned at 1 — keeping these expectations green as the
// gate moves. (NOTE the coupling flagged for the spec owner: the label no longer
// reaches full alpha at 0.5 Mpc.)
const distanceFadeAt = (camDistMpc: number): number =>
  milkyWayLabelAlpha(camDistMpc) * fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc);

describe('produceMilkyWayLabel', () => {
  it('emits one label and one line at the composed distance fade when close and enabled', () => {
    const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(0.5));
    expect(out.labels).toHaveLength(1);
    expect(out.lines).toHaveLength(1);
    expect(out.labels[0]!.id).toBe('milkyWay'); // id = source id; text stays below
    expect(out.labels[0]!.text).toBe('You are here');
    expect(out.lines[0]!.ownerLabelId).toBe('milkyWay');
    // Label and stem fade in lock-step at the derived distance fade.
    const expected = distanceFadeAt(0.5);
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(expected);
    expect(out.lines[0]!.fadeAlpha).toBeCloseTo(expected);
  });

  it('outranks every structure label in the declutter (top prominence)', () => {
    // "You are here" is the orientation anchor: when it is visible at all
    // (camera within the fade band), overlapping structure labels must yield
    // to it, never the other way around. Number.MAX_VALUE sorts above any
    // finite apparent size a producer can emit.
    const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(0.5));
    expect(out.labels[0]!.prominencePx).toBe(Number.MAX_VALUE);
  });

  it('emits nothing far away (>= 2 Mpc) even when enabled', () => {
    const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(2.0));
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('emits nothing on the deep-zoom descent (inside the survey band)', () => {
    // At solar-system zoom the origin-anchored "You are here" annotation is COSMO
    // content the near plane can no longer project, and leaving it emitting keeps
    // the director's marker-line set non-empty — so the whole marker-lines pass
    // runs every frame drawing a near-degenerate stem. The surveyDeepZoom band
    // (gone by 2 kpc = 0.002 Mpc) must cull it: no label AND no leader stem.
    const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(1e-6));
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('emits nothing when the label axis is disabled and faded out', () => {
    const out = produceMilkyWayLabel(makeState(false, 0), makeCtx(0.5));
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('multiplies the layer opacity into the distance fade', () => {
    const out = produceMilkyWayLabel(makeState(true, 0.5), makeCtx(0.5));
    // fadeAlpha = distanceFade(0.5) · layerOpacity(0.5)
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(distanceFadeAt(0.5) * 0.5);
  });

  it('keeps emitting the fade-out tail when disabled but still fading (opacity > 0)', () => {
    const out = produceMilkyWayLabel(makeState(false, 0.3), makeCtx(0.5));
    expect(out.labels).toHaveLength(1);
    // fadeAlpha = distanceFade(0.5) · layerOpacity(0.3)
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(distanceFadeAt(0.5) * 0.3);
  });

  it('focusedOnly mode: emits nothing when something else (or nothing) is focused', () => {
    const elsewhere = { type: 'structure', id: 'cluster-virgo' };
    expect(
      produceMilkyWayLabel(
        makeState(true, 1, { focusedOnly: true, focus: elsewhere }),
        makeCtx(0.5),
      ).labels,
    ).toEqual([]);
    expect(
      produceMilkyWayLabel(makeState(true, 1, { focusedOnly: true, focus: null }), makeCtx(0.5))
        .labels,
    ).toEqual([]);
  });

  it('focusedOnly mode: emits the label when the Milky Way is the focused subject', () => {
    const out = produceMilkyWayLabel(
      makeState(true, 1, { focusedOnly: true, focus: { type: 'milkyWay' } }),
      makeCtx(0.5),
    );
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0]!.id).toBe('milkyWay');
  });

  it('reports awake: false across the fade band', () => {
    for (const r of [0.1, 0.5, 0.8, 1.1, 1.5]) {
      const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(r));
      expect(out.awake).toBe(false);
    }
  });

  it('lifts the label straight up in screen space under a rolled camera', () => {
    // A rolled camera is exactly where the retired world +Y anchor failed:
    // world-up projects diagonally, so a world offset would lay the stem over
    // the text. The screen-space lift must hold regardless — label straight
    // above the origin dot at the proportional lift, stem top exactly the
    // padding below the text's measured bottom.
    // Precision 2 (±0.005 px) absorbs the f32 project→un-project round trip.
    const ctx = makeCtx(0.5, { up: [Math.sin(0.6), Math.cos(0.6), 0] });
    const out = produceMilkyWayLabel(makeState(true, 1), ctx);

    const liftPx = expectedLiftPx(0.5, 1080);
    const dot = screenOf(ctx, [0, 0, 0]);
    const anchor = screenOf(ctx, out.labels[0]!.worldPos);
    expect(anchor[0]).toBeCloseTo(dot[0], 2);
    expect(dot[1] - anchor[1]).toBeCloseTo(liftPx, 2);

    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]!.fromWorld).toEqual([0, 0, 0]);
    const tip = screenOf(ctx, out.lines[0]!.toWorld);
    expect(tip[0]).toBeCloseTo(dot[0], 2);
    expect(tip[1] - anchor[1]).toBeCloseTo(TEXT_BOTTOM_BELOW_ANCHOR_PX + LEADER_LINE_PADDING_PX, 2);
  });

  it('keeps a deep-hanging caption clear of the dot and keeps its stem', () => {
    // Small viewport (200 px tall) at 1.5 Mpc: the proportional lift (~5.2 px)
    // is floored, and a caption whose ink extends deep below its anchor (bbox
    // maxY 60 atlas px → ~32 px on screen at the 45 px em clamp) would — under
    // an anchor-only 28 px floor — swallow the whole lift, land the text on
    // the dot, and suppress its own stem (28 − 32 − 6 < 0). The clearance
    // guarantee raises the lift by the deficit instead: the measured ink
    // bottom stays MIN_LABEL_CLEARANCE_PX above the dot and the stem is
    // present with the exact padding gap.
    const inkDropPx = 60 * (MILKY_WAY_LABEL_STYLE.minPixelSize / ATLAS_FONT_SIZE);
    const ctx = makeCtx(1.5, { width: 320, height: 200 });
    const out = produceMilkyWayLabel(
      makeState(true, 1, { bbox: { minX: -60, minY: -40, maxX: 60, maxY: 60 } }),
      ctx,
    );

    expect(out.labels).toHaveLength(1);
    const dot = screenOf(ctx, [0, 0, 0]);
    const anchor = screenOf(ctx, out.labels[0]!.worldPos);
    // The ink bottom (anchor + ink drop, screen +Y down) clears the dot by
    // exactly the guaranteed minimum.
    expect(dot[1] - (anchor[1] + inkDropPx)).toBeCloseTo(MIN_LABEL_CLEARANCE_PX, 2);
    // The stem is present, top at the padding below the ink bottom.
    expect(out.lines).toHaveLength(1);
    const tip = screenOf(ctx, out.lines[0]!.toWorld);
    expect(tip[1] - anchor[1]).toBeCloseTo(inkDropPx + LEADER_LINE_PADDING_PX, 2);
  });
});
