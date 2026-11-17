import { describe, expect, it, vi } from 'vitest';
import { VIEW_RIGS } from '../../../../src/data/rendering/viewRigs';
import { mat4, mat4d } from 'wgpu-matrix';
import { ATLAS_FONT_SIZE } from '../../../../src/data/fonts';
import { createLabel2DDirector } from '../../../../src/services/engine/subsystems/label2DDirector';
import { COSMO_LABEL_DIRECTOR as COSMO_CONFIG } from '../../../../src/data/labels/cosmoLabelDirectorConfig';
import { FOREGROUND_LABEL_DIRECTOR as FOREGROUND_CONFIG } from '../../../../src/data/labels/foregroundLabelDirectorConfig';
import { identityLabelProjection } from '../../../helpers/labels/identityLabelProjection';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CAPTION_PRIORITY_SCALE } from '../../../../src/data/labels/captionPriorityScale';
import type { Label2DProducer } from '../../../../src/@types/engine/subsystems/Label2DProducer';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { Label2DDirectorConfig } from '../../../../src/@types/engine/subsystems/Label2DDirectorConfig';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import { LABEL_EM_PX_RETUNE } from '../../../../src/data/labels/labelSizingDefaults';
import { APP_VISIBILITY_REGISTRY } from '../../../../src/compositions/appVisibility';
import { MILD_RECESSION } from '../../../../src/data/mildRecession';

function makeState(): EngineState {
  // The director fires no layer load-in (each producer owns its own), but
  // the stub keeps a `fades.fadeTo` spy so tests can assert the director
  // never calls it.
  return {
    subsystems: { fades: { fadeTo: vi.fn() } },
    selection: { hover: null, select: null },
    selectionKindRows: [],
  } as unknown as EngineState;
}

// Two selectable subjects whose pick ids are their numeric ref index, so a
// label's `pickId` names the ref without the real source registry.
const HIGHLIGHT_ROWS = [
  {
    type: 'body',
    encodePick: (ref: { id: string }) => (ref.id === 'earth' ? 7 : ref.id === 'mars' ? 8 : null),
  },
] as unknown as EngineState['selectionKindRows'];

function makeHighlightState(hover: string | null, select: string | null): EngineState {
  const ref = (id: string | null) => (id === null ? null : { type: 'body', id });
  return {
    ...makeState(),
    selection: { hover: ref(hover), select: ref(select) },
    selectionKindRows: HIGHLIGHT_ROWS,
  } as unknown as EngineState;
}

// The shipped director configs, projecting as the identity-vp fixtures below
// expect (`identityLabelProjection`); the slab projections have their own tests.
const COSMO_LABEL_DIRECTOR = { ...COSMO_CONFIG, project: identityLabelProjection };
const FOREGROUND_LABEL_DIRECTOR = { ...FOREGROUND_CONFIG, project: identityLabelProjection };

// Identity vp + 1000×1000 canvas: a label at world [x,y,0] projects to screen
// ((x·0.5+0.5)·1000, (1−(y·0.5+0.5))·1000). So [0,0,0] → centre (500,500);
// |x| or |y| > 1 lands the anchor off-screen (never dropped, never blocks).
//
// `nowMs` is the frame's stamped clock: the appear/disappear envelope is a
// pure function of it, so tests step time by passing explicit stamps.  The
// envelope ramp is 300 ms of smoothstep, so 0 / 150 / 300 hit alpha
// 0 / 0.5 / 1 exactly.
function makeCtx(nowMs = 0): FrameView {
  return {
    snapshot: { nowMs },
    drawCamPos: [0, 0, 0],
    vp: mat4.identity(),
    canvasSize: { width: 1000, height: 1000 },
    // The pxPerRad that, through the label sizing's retune factor, reproduces
    // the pre-pxPerRad `viewportHeight / 2` projection these rects assume.
    drawPxPerRad: 500 / LABEL_EM_PX_RETUNE,
  } as unknown as FrameView;
}

// The NEAR0 lift reads `ctx.slabs[NEAR0]`; an identity slab vp keeps it on
// `makeCtx`'s [x,y,0] → screen mapping.
const NEAR0_SLAB: Slab = {
  index: NEAR0,
  near: 1e-6,
  far: 1,
  vp: mat4d.identity() as Float64Array,
  frame: { kind: 'world-mpc', originRelative: true },
  distanceRangeM: [1e-6 * SCALE_UNITS.MPC_TO_M, 1 * SCALE_UNITS.MPC_TO_M],
  precision: 'f64',
  reversedZ: true,
};

function makeNear0Ctx(nowMs = 0): FrameView {
  return {
    snapshot: { nowMs },
    drawCamPos: [0, 0, 0],
    slabs: [NEAR0_SLAB],
    canvasSize: { width: 1000, height: 1000 },
    // The pxPerRad that, through the label sizing's retune factor, reproduces
    // the pre-pxPerRad `viewportHeight / 2` projection these rects assume.
    drawPxPerRad: 500 / LABEL_EM_PX_RETUNE,
  } as unknown as FrameView;
}

function makeProducer(id: string, labels: Label2D[], awake = false): Label2DProducer {
  return { id, produceLabels: () => ({ labels, awake }) };
}

function makeLabelStub() {
  return {
    setLabels: vi.fn(),
    render: vi.fn(),
    destroy: vi.fn(),
  };
}
// Default measure: a modest single-line box extending up from the
// baseline anchor (text sits above `worldPos`), 20 atlas px per
// character.  Rect-declutter tests override this per label.
function defaultMeasure(label: Label2D) {
  return { minX: 0, minY: -30, maxX: 20 * label.text.length, maxY: 0 };
}

/** Every setLabels flush in call order — for asserting alpha trajectories. */
function flushedLabels(stub: ReturnType<typeof makeLabelStub>): Label2D[][] {
  return stub.setLabels.mock.calls.map((c) => c[0] as Label2D[]);
}

const SAMPLE_LABEL: Label2D = {
  id: 'sample-label',
  worldPos: [0, 0, 0],
  text: 'x',
  font: 'cormorant',
  pixelSize: 10,
};
// A scene-body caption's leader (`composeForegroundCaption`).
const RIM_LEADER = { widthPx: 2.5, base: 'rim', gapPx: 4 } as const;

describe('label2DDirector', () => {
  it('no-ops when renderers are not attached', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    dir.registerProducer(makeProducer('p', [SAMPLE_LABEL]));
    expect(() => dir.runFrame(makeState(), makeCtx())).not.toThrow();
  });

  it('merges labels from multiple producers', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    const labelStub = makeLabelStub();
    dir.attachRenderers(labelStub as never, defaultMeasure);

    // Distinct world positions so the two anchors don't collide on screen.
    const a: Label2D = { ...SAMPLE_LABEL, id: 'a', worldPos: [-0.5, 0, 0] };
    const b: Label2D = { ...SAMPLE_LABEL, id: 'b', worldPos: [0.5, 0, 0] };
    dir.registerProducer(makeProducer('pa', [a]));
    dir.registerProducer(makeProducer('pb', [b]));

    expect(dir.labels()).toEqual([]);

    // First frame enters at envelope alpha 0; run a second frame past the
    // 300 ms ramp so the flush carries the producers' labels at full alpha.
    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([a, b]);
    expect(dir.labels()).toEqual([a, b]);
  });

  // Recession runs once, in the director, keyed on identity, not clickability.
  it('a receding label recedes once, and the focused one not at all', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    const labelStub = makeLabelStub();
    dir.attachRenderers(labelStub as never, defaultMeasure);
    const FOCUS = 11;
    const focused: Label2D = { ...SAMPLE_LABEL, id: 'a', worldPos: [-0.5, 0, 0], subjectId: FOCUS };
    const sibling: Label2D = { ...SAMPLE_LABEL, id: 'b', worldPos: [0.5, 0, 0], subjectId: 12 };
    dir.registerProducer({
      id: 'structures',
      label: 'structure',
      produceLabels: () => ({ labels: [focused, sibling], awake: false }),
    });
    const state = {
      ...makeState(),
      visibilityEntries: APP_VISIBILITY_REGISTRY,
    } as unknown as EngineState;
    const ctxAt = (nowMs: number) =>
      ({
        ...makeCtx(nowMs),
        snapshot: { nowMs, focusBlend: 1, focusPickId: FOCUS },
      }) as unknown as FrameView;

    dir.runFrame(state, ctxAt(0));
    dir.runFrame(state, ctxAt(300));
    const alphaOf = (id: string) => dir.labels().find((l) => l.id === id)!.fadeAlpha ?? 1;
    expect(alphaOf('a')).toBe(1);
    expect(alphaOf('b')).toBeCloseTo(MILD_RECESSION);
  });

  it('skips re-uploading the same merged set across frames once settled', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    const labelStub = makeLabelStub();
    dir.attachRenderers(labelStub as never, defaultMeasure);
    dir.registerProducer(makeProducer('p', [SAMPLE_LABEL]));

    // The envelope animates alpha during the first 300 ms, so flushes
    // legitimately repeat while ramping; the signature skip is asserted
    // AFTER everything settles.
    dir.runFrame(makeState(), makeCtx(0)); // enter at alpha 0
    dir.runFrame(makeState(), makeCtx(300)); // settled at alpha 1
    dir.runFrame(makeState(), makeCtx(600)); // identical settled set → skip
    expect(labelStub.setLabels).toHaveBeenCalledTimes(2);
  });

  it('reports the vote when any producer is awake', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    const labelStub = makeLabelStub();
    dir.attachRenderers(labelStub as never, defaultMeasure);
    dir.registerProducer(makeProducer('p', [], true));

    expect(dir.runFrame(makeState(), makeCtx())).toBe(true);
  });

  it('re-uploads when a label fadeAlpha changes (smooth fade transitions)', () => {
    // Regression test for the youAreHere fade band: a producer that flips
    // fadeAlpha at a fixed id must re-upload. If the signature only watched
    // id+count, the GPU buffer would stay stuck at the first-frame fadeAlpha
    // and the label and its leader would draw at the wrong opacity.
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    const labelStub = makeLabelStub();
    dir.attachRenderers(labelStub as never, defaultMeasure);

    // Producer whose output flips fadeAlpha between calls but keeps
    // the same id (same scenario as youAreHere mid-fade).
    let alpha = 0.3;
    const producer: Label2DProducer = {
      id: 'p',
      produceLabels: () => ({
        labels: [{ ...SAMPLE_LABEL, fadeAlpha: alpha }],
        awake: alpha > 0 && alpha < 1,
      }),
    };
    dir.registerProducer(producer);

    dir.runFrame(makeState(), makeCtx(0)); // envelope 0 × 0.3 = 0
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);

    dir.runFrame(makeState(), makeCtx(300)); // envelope settled → 0.3
    expect(labelStub.setLabels).toHaveBeenCalledTimes(2);

    alpha = 0.7;
    dir.runFrame(makeState(), makeCtx(400)); // producer alpha change → 0.7
    expect(labelStub.setLabels).toHaveBeenCalledTimes(3);

    // Settling at the same fadeAlpha should NOT re-upload — the
    // signature optimization still skips identical frames.
    dir.runFrame(makeState(), makeCtx(500));
    expect(labelStub.setLabels).toHaveBeenCalledTimes(3);
  });

  it('re-uploads when a label colour changes at fixed id (hover highlight)', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    const labelStub = makeLabelStub();
    dir.attachRenderers(labelStub as never, defaultMeasure);

    let color: [number, number, number, number] = [0.5, 0.6, 0.7, 1];
    dir.registerProducer({
      id: 'p',
      produceLabels: () => ({ labels: [{ ...SAMPLE_LABEL, color }], awake: false }),
    });

    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300)); // envelope settled
    dir.runFrame(makeState(), makeCtx(400));
    const settled = labelStub.setLabels.mock.calls.length;

    color = [0.8, 0.84, 0.88, 1];
    dir.runFrame(makeState(), makeCtx(500));
    expect(labelStub.setLabels).toHaveBeenCalledTimes(settled + 1);
  });

  describe('highlight', () => {
    const BASE: Label2D = { ...SAMPLE_LABEL, color: [0.5, 0.5, 0.5, 0.8], pickId: 7 };

    function flushWith(
      config: Label2DDirectorConfig,
      ctx: FrameView,
      state: EngineState,
      labels: Label2D[],
    ) {
      const dir = createLabel2DDirector(config, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);
      dir.registerProducer(makeProducer('p', labels));
      dir.runFrame(state, ctx);
      return { dir, flushed: flushedLabels(labelStub).at(-1)![0]! };
    }

    it('whitens a hovered label by the hover amount and leaves alpha alone', () => {
      const { flushed } = flushWith(
        COSMO_LABEL_DIRECTOR,
        makeCtx(300),
        makeHighlightState('earth', null),
        [BASE],
      );
      expect(flushed.color![0]).toBeCloseTo(0.5 * 0.4 + 0.6, 12);
      expect(flushed.color![3]).toBe(0.8);
    });

    it('whitens a selected label further, and selected wins when both name it', () => {
      const { flushed } = flushWith(
        COSMO_LABEL_DIRECTOR,
        makeCtx(300),
        makeHighlightState('earth', 'earth'),
        [BASE],
      );
      expect(flushed.color![0]).toBeCloseTo(0.5 * 0.1 + 0.9, 12);
    });

    it('never touches a label with no pick id, a different subject, or no colour', () => {
      const labels: Label2D[] = [
        { ...BASE, id: 'a', pickId: undefined },
        { ...BASE, id: 'b', pickId: 8, worldPos: [0.5, 0, 0] },
        { ...SAMPLE_LABEL, id: 'c', pickId: 7, worldPos: [-0.5, 0, 0] },
      ];
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);
      dir.registerProducer(makeProducer('p', labels));
      dir.runFrame(makeHighlightState('earth', null), makeCtx(300));
      const flushed = flushedLabels(labelStub).at(-1)!;
      expect(flushed.find((l) => l.id === 'a')!.color).toEqual(BASE.color);
      expect(flushed.find((l) => l.id === 'b')!.color).toEqual(BASE.color);
      expect(flushed.find((l) => l.id === 'c')!.color).toBeUndefined();
    });

    it('re-uploads when only the hover changes at a fixed label set', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);
      dir.registerProducer(makeProducer('p', [BASE]));
      dir.runFrame(makeHighlightState(null, null), makeCtx(300));
      dir.runFrame(makeHighlightState(null, null), makeCtx(400));
      const settled = labelStub.setLabels.mock.calls.length;

      dir.runFrame(makeHighlightState('earth', null), makeCtx(500));
      expect(labelStub.setLabels).toHaveBeenCalledTimes(settled + 1);
    });
  });

  it('re-uploads when a label loses its pick id at fixed id (focus strips it)', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    const labelStub = makeLabelStub();
    dir.attachRenderers(labelStub as never, defaultMeasure);

    let pickId: number | undefined = 7;
    dir.registerProducer({
      id: 'p',
      produceLabels: () => ({ labels: [{ ...SAMPLE_LABEL, pickId }], awake: false }),
    });

    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300)); // envelope settled
    dir.runFrame(makeState(), makeCtx(400));
    const settled = labelStub.setLabels.mock.calls.length;

    pickId = undefined;
    dir.runFrame(makeState(), makeCtx(500));
    expect(labelStub.setLabels).toHaveBeenCalledTimes(settled + 1);
  });

  it('re-uploads when the text ceiling changes at a fixed id (the famous distance ramp)', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    const labelStub = makeLabelStub();
    dir.attachRenderers(labelStub as never, defaultMeasure);

    let maxPixelSize = 150;
    dir.registerProducer({
      id: 'p',
      produceLabels: () => ({ labels: [{ ...SAMPLE_LABEL, maxPixelSize }], awake: false }),
    });
    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    dir.runFrame(makeState(), makeCtx(400));
    const settled = labelStub.setLabels.mock.calls.length;

    maxPixelSize = 120; // the camera drew back: the row moves no more, so this must key it
    dir.runFrame(makeState(), makeCtx(500));
    expect(labelStub.setLabels).toHaveBeenCalledTimes(settled + 1);
  });

  it('re-uploads a label when its anchor moves at a fixed id', () => {
    // NEAR0 anchors are camera-relative and bodies move, while id and
    // fadeAlpha stay constant: without `worldPos` in the signature the
    // uploaded anchor would freeze and the text drift off its subject.
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    const labelStub = makeLabelStub();
    dir.attachRenderers(labelStub as never, defaultMeasure);

    let anchorY = 0;
    const producer: Label2DProducer = {
      id: 'p',
      produceLabels: () => ({
        labels: [{ ...SAMPLE_LABEL, worldPos: [0, anchorY, 0] }],
        awake: false,
      }),
    };
    dir.registerProducer(producer);

    dir.runFrame(makeState(), makeCtx(0)); // enter at envelope alpha 0
    dir.runFrame(makeState(), makeCtx(300)); // settle at alpha 1
    const settledCalls = labelStub.setLabels.mock.calls.length;

    dir.runFrame(makeState(), makeCtx(600)); // identical settled anchor → skip
    expect(labelStub.setLabels.mock.calls.length).toBe(settledCalls);

    anchorY = 0.3; // the subject moved
    dir.runFrame(makeState(), makeCtx(900));
    expect(labelStub.setLabels.mock.calls.length).toBe(settledCalls + 1);
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([
      { ...SAMPLE_LABEL, worldPos: [0, 0.3, 0] },
    ]);
  });

  it('flushes empty when no producers contribute, then skips subsequent empties', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    const labelStub = makeLabelStub();
    dir.attachRenderers(labelStub as never, defaultMeasure);

    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(100));
    // First call writes []; second call's signature matches, skip.
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);
    expect(labelStub.setLabels).toHaveBeenCalledWith([]);
  });

  it('declutters colliding on-screen labels across producers, keeping higher declutter priority', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    const labelStub = makeLabelStub();
    dir.attachRenderers(labelStub as never, defaultMeasure);

    // Two labels at the same world point (both project to screen centre, so
    // their rects overlap). The higher declutter priority wins.
    const big: Label2D = { ...SAMPLE_LABEL, id: 'big', declutterPriority: 100 };
    const small: Label2D = { ...SAMPLE_LABEL, id: 'small', declutterPriority: 10 };
    dir.registerProducer(makeProducer('pbig', [big]));
    dir.registerProducer(makeProducer('psmall', [small]));

    // The culled label never enters the envelope (it sits below declutter),
    // so only the winner fades in; settle past the ramp and assert.
    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([big]);
  });

  describe('rect-based declutter geometry', () => {
    // Both tests pin the projected em height to exactly ATLAS_FONT_SIZE
    // (min = max clamp), so measured atlas px map 1:1 to screen px and
    // the rects below can be reasoned about in plain pixels.
    const RECT_LABEL: Label2D = {
      ...SAMPLE_LABEL,
      minPixelSize: ATLAS_FONT_SIZE,
      maxPixelSize: ATLAS_FONT_SIZE,
      worldEmMpc: 1,
    };

    it('keeps a label whose anchor is near another but whose text rect is clear of it', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      // Baseline-aligned text: the rect spans 30 px UP from the anchor.
      const measure = () => ({ minX: -50, minY: -30, maxX: 50, maxY: 0 });
      dir.attachRenderers(labelStub as never, measure);

      // B sits 40 screen px BELOW A (screen y 500 → 540). The anchors are
      // close, but A's text occupies y∈[470,500]
      // and B's y∈[510,540] — visually clear. Neither may be culled.
      const a: Label2D = { ...RECT_LABEL, id: 'a', worldPos: [0, 0, 0], declutterPriority: 100 };
      const b: Label2D = { ...RECT_LABEL, id: 'b', worldPos: [0, -0.08, 0], declutterPriority: 10 };
      dir.registerProducer(makeProducer('p', [a, b]));

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(300));
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([a, b]);
    });

    it('culls the lower-priority label when wide text rects overlap despite distant anchors', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      // Wide centered text: 300 px across the anchor.
      const measure = () => ({ minX: -150, minY: -15, maxX: 150, maxY: 15 });
      dir.attachRenderers(labelStub as never, measure);

      // B sits 100 screen px RIGHT of A (screen x 500 → 600), but the
      // 300 px-wide rects overlap by 200 px.
      const a: Label2D = { ...RECT_LABEL, id: 'a', worldPos: [0, 0, 0], declutterPriority: 100 };
      const b: Label2D = { ...RECT_LABEL, id: 'b', worldPos: [0.2, 0, 0], declutterPriority: 10 };
      dir.registerProducer(makeProducer('p', [a, b]));

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(300));
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([a]);
    });
  });

  it('never drops or blocks off-screen labels', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
    const labelStub = makeLabelStub();
    dir.attachRenderers(labelStub as never, defaultMeasure);

    // On-screen low-priority label + an off-screen label (|x| > 1 → outside
    // NDC). The off-screen one is accepted unconditionally and never blocks.
    const onScreen: Label2D = {
      ...SAMPLE_LABEL,
      id: 'on',
      declutterPriority: 1,
      worldPos: [0, 0, 0],
    };
    const offScreen: Label2D = {
      ...SAMPLE_LABEL,
      id: 'off',
      declutterPriority: 999,
      worldPos: [5, 0, 0],
    };
    dir.registerProducer(makeProducer('p', [onScreen, offScreen]));

    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([onScreen, offScreen]);
  });

  describe('appear/disappear envelope', () => {
    it('fades a newly appearing label in over the 300 ms ramp (smoothstep of nowMs)', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);
      dir.registerProducer(makeProducer('p', [SAMPLE_LABEL]));

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(150));
      dir.runFrame(makeState(), makeCtx(300));

      const flushes = flushedLabels(labelStub);
      expect(flushes).toHaveLength(3); // alpha changed each frame → 3 uploads
      expect(flushes[0]![0]!.fadeAlpha).toBe(0); // ramp start
      expect(flushes[1]![0]!.fadeAlpha).toBe(0.5); // smoothstep(0.5) = 0.5
      // Settled: envelope is exactly 1, so the producer's label passes
      // through untouched (fadeAlpha absent ⇒ 1).
      expect(flushes[2]![0]!.fadeAlpha ?? 1).toBe(1);
      expect(flushes[2]).toEqual([SAMPLE_LABEL]);
    });

    it('fades a disappearing label out by re-emitting the remembered label, then drops it', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      let labels: Label2D[] = [SAMPLE_LABEL];
      dir.registerProducer({ id: 'p', produceLabels: () => ({ labels, awake: false }) });

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(300)); // fully in

      labels = []; // producer stops emitting — the envelope's tail takes over
      dir.runFrame(makeState(), makeCtx(400)); // transition frame: tail starts from alpha 1
      dir.runFrame(makeState(), makeCtx(550)); // halfway out — remembered label at 0.5
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([{ ...SAMPLE_LABEL, fadeAlpha: 0.5 }]);

      dir.runFrame(makeState(), makeCtx(700)); // ramp complete (≥ 400+300) → dropped
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([]);

      const callsAfterDrop = labelStub.setLabels.mock.calls.length;
      dir.runFrame(makeState(), makeCtx(800)); // stays gone: no re-emission, no re-upload
      expect(labelStub.setLabels.mock.calls.length).toBe(callsAfterDrop);
    });

    it('multiplies the envelope with the producer-driven fadeAlpha', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);
      const dimmed: Label2D = { ...SAMPLE_LABEL, fadeAlpha: 0.5 };
      dir.registerProducer(makeProducer('p', [dimmed]));

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(150));
      dir.runFrame(makeState(), makeCtx(300));

      const flushes = flushedLabels(labelStub);
      expect(flushes[0]![0]!.fadeAlpha).toBe(0); // 0.5 × 0
      expect(flushes[1]![0]!.fadeAlpha).toBe(0.25); // 0.5 × 0.5
      expect(flushes[2]![0]!.fadeAlpha).toBe(0.5); // 0.5 × 1 — producer value survives
    });

    it('keeps the loop awake while any envelope ramps, and goes quiet once settled', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      let labels: Label2D[] = [SAMPLE_LABEL];
      // Producer is never awake — every vote below comes from the envelope.
      dir.registerProducer({ id: 'p', produceLabels: () => ({ labels, awake: false }) });

      expect(dir.runFrame(makeState(), makeCtx(0))).toBe(true); // fade-in in flight
      expect(dir.runFrame(makeState(), makeCtx(150))).toBe(true); // still ramping
      expect(dir.runFrame(makeState(), makeCtx(300))).toBe(false); // settled → quiet

      labels = [];
      expect(dir.runFrame(makeState(), makeCtx(400))).toBe(true); // fade-out tail in flight
      expect(dir.runFrame(makeState(), makeCtx(700))).toBe(false); // tail complete → quiet again
    });

    it('resumes from the current alpha when a label reappears mid-fade-out (no pop either way)', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      let labels: Label2D[] = [SAMPLE_LABEL];
      dir.registerProducer({ id: 'p', produceLabels: () => ({ labels, awake: false }) });

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(300)); // fully in (alpha 1)

      labels = [];
      dir.runFrame(makeState(), makeCtx(400)); // fade-out starts from 1
      dir.runFrame(makeState(), makeCtx(475)); // 1 − smoothstep(0.25) = 0.84375
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([
        { ...SAMPLE_LABEL, fadeAlpha: 0.84375 },
      ]);

      labels = [SAMPLE_LABEL]; // reappears mid-fade-out
      // The out-ramp would have read 1 − smoothstep(150/300) = 0.5 at this
      // instant; the reversal resumes from exactly that value — continuous
      // with the previous frame's trajectory, no jump in either direction.
      dir.runFrame(makeState(), makeCtx(550));
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([{ ...SAMPLE_LABEL, fadeAlpha: 0.5 }]);

      dir.runFrame(makeState(), makeCtx(700)); // 0.5 + 0.5·smoothstep(0.5) = 0.75
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([{ ...SAMPLE_LABEL, fadeAlpha: 0.75 }]);

      dir.runFrame(makeState(), makeCtx(850)); // 300 ms after the reversal → fully back in
      const flushes = flushedLabels(labelStub);
      expect(flushes[flushes.length - 1]![0]!.fadeAlpha ?? 1).toBe(1);
    });
  });

  describe('the projection stage', () => {
    it('sorts by declutterPriority descending with a stable input-order tiebreak', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      // Same world point, same declutter priority — the padded rects fully overlap,
      // so exactly one survives. Only registration order can break the tie.
      const first: Label2D = { ...SAMPLE_LABEL, id: 'first', declutterPriority: 50 };
      const second: Label2D = { ...SAMPLE_LABEL, id: 'second', declutterPriority: 50 };
      dir.registerProducer(makeProducer('p', [first, second]));

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(300));
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([first]);
    });
  });

  describe('the NEAR0 arms (spec §4.6, §4.4)', () => {
    it('exponentialApproach seeds a new id AT its target, not at 0', () => {
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      // No `lift` field — isolates the envelope seed from the lift stage.
      const caption: Label2D = { ...SAMPLE_LABEL, fadeAlpha: 0.4 };
      dir.registerProducer(makeProducer('p', [caption]));

      // A single frame: unlike smoothstepRamp's 0→1 ramp, a new id seeds AT
      // its target, so the very first flush already carries 0.4 — no second
      // frame needed to "settle".
      dir.runFrame(makeState(), makeNear0Ctx(0));
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([caption]);
    });

    it('a zero-target caption does not occupy declutter space and cannot suppress a real caption', () => {
      // Mirrors `labelsNearPass.ts:269`'s candidate filter
      // (`baseTarget === 0 || screenPx === null` never enters the cull).
      // Without it, `zeroTarget`'s huge declutter priority would win the
      // declutter and cull `visible` — which would then
      // never show, even though it has a real, positive target.
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      const zeroTarget: Label2D = {
        ...SAMPLE_LABEL,
        id: 'zero-target',
        declutterPriority: 1000,
        fadeAlpha: 0,
      };
      const visible: Label2D = {
        ...SAMPLE_LABEL,
        id: 'visible',
        declutterPriority: 1,
        fadeAlpha: 1,
      };
      dir.registerProducer(makeProducer('p', [zeroTarget, visible]));

      dir.runFrame(makeState(), makeNear0Ctx(0));

      // `visible` survives and seeds AT its target immediately; `zeroTarget`
      // never has anything to show (its own fadeAlpha is 0 either way).
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([visible]);
    });

    it('exponentialApproach drops an absent id immediately, with no remembered-emission tail', () => {
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      let labels: Label2D[] = [{ ...SAMPLE_LABEL, fadeAlpha: 0.4 }];
      dir.registerProducer({ id: 'p', produceLabels: () => ({ labels, awake: false }) });

      dir.runFrame(makeState(), makeNear0Ctx(0));
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([labels[0]]);

      // The producer stops emitting — unlike COSMO's smoothstepRamp, there is
      // no remembered-emission tail: the very next frame flushes empty.
      labels = [];
      dir.runFrame(makeState(), makeNear0Ctx(50));
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([]);
    });

    it('a declutter-culled caption eases to 0 and eases back in, rather than popping — and the wake vote tracks it', () => {
      // CRITICAL fix: a label declutter culls this frame is CULLED, not
      // ABSENT — its producer keeps emitting it every frame, so it must
      // stay in the exponential filter's universe (target 0) and ease
      // toward invisible, not vanish on the cull frame and re-seed at full
      // target the instant the cull flips back (`labelsNearPass.ts:306`
      // sets a culled entry's TARGET to 0 while it stays in `entries`,
      // pruned only when the producer itself stops emitting it, `:325-328`).
      // Also pins the render-loop WAKE VOTE (`runFrame`'s boolean) across the
      // same four frames — this is the cull-driven counterpart of the
      // producer-driven demand-drop test below, which checks the vote for
      // the OTHER branch of `applyExponentialEnvelope`'s target (`ownAlpha`
      // vs `survivorIds`); this test's `small` label never changes its own
      // `fadeAlpha` — only declutter survival flips its target.
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      // `big` always wins a collision (higher declutter priority); its worldPos
      // toggles between far-from-`small` (no contest) and on top of it
      // (contest, `small` loses). `small` itself never moves and is always
      // emitted — declutter alone decides whether it's this frame's survivor.
      let bigPos: [number, number, number] = [5, 0, 0]; // off-screen-ish, no collision
      dir.registerProducer({
        id: 'p',
        produceLabels: () => ({
          labels: [
            { ...SAMPLE_LABEL, id: 'big', worldPos: bigPos, declutterPriority: 100, fadeAlpha: 1 },
            {
              ...SAMPLE_LABEL,
              id: 'small',
              worldPos: [0, 0, 0],
              declutterPriority: 10,
              fadeAlpha: 1,
            },
          ],
          awake: false,
        }),
      });

      // Every `small` object always carries an explicit `fadeAlpha` (either
      // the producer's literal `1` or the envelope's rewritten value), so a
      // defined return means "present in the flush, at this alpha".
      const smallAlphaOf = (): number | undefined =>
        (labelStub.setLabels.mock.calls.at(-1)![0] as Label2D[]).find((l) => l.id === 'small')
          ?.fadeAlpha;

      // Frame 1: no collision — `small` survives trivially and seeds AT its
      // target (1) immediately — a seed is not a ramp, so the wake vote is
      // quiet.
      expect(dir.runFrame(makeState(), makeNear0Ctx(0))).toBe(false);
      expect(smallAlphaOf()).toBe(1);

      // Frame 2: `big` moves onto `small` — declutter culls `small` this
      // frame. It must EASE toward 0 (a fractional alpha), not pop straight
      // to absent — and the mid-ramp frame must wake the loop.
      bigPos = [0, 0, 0];
      expect(dir.runFrame(makeState(), makeNear0Ctx(50))).toBe(true);
      const easingOut = smallAlphaOf();
      expect(easingOut).not.toBeUndefined();
      expect(easingOut!).toBeGreaterThan(0);
      expect(easingOut!).toBeLessThan(1);

      // Frame 3: still colliding, far enough later that the filter fully
      // settles at 0 — `small` finally drops out of the flush, and the wake
      // vote goes quiet again.
      expect(dir.runFrame(makeState(), makeNear0Ctx(5050))).toBe(false);
      expect(smallAlphaOf()).toBeUndefined();

      // Frame 4: the collision clears — `small` survives again. It must
      // ease BACK IN from wherever it left off (0), not snap straight to
      // its full target (1) — waking the loop again for the ease-in.
      bigPos = [5, 0, 0];
      expect(dir.runFrame(makeState(), makeNear0Ctx(5100))).toBe(true);
      const easingIn = smallAlphaOf();
      expect(easingIn).not.toBeUndefined();
      expect(easingIn!).toBeGreaterThan(0);
      expect(easingIn!).toBeLessThan(1);
    });

    it('eases a producer-driven target drop to 0 (demand fading, not a declutter cull), and the wake vote goes quiet once settled', () => {
      // Distinct from the cull case above: this label is NEVER contested —
      // it always survives declutter — but the PRODUCER's own `fadeAlpha`
      // falls to 0 (e.g. a caption's distance-band fade closing), moved from
      // `labelsNearPass.ts`'s demand-drop tail
      // (`declutterByScreenSeparationArm`'s target read is `label.fadeAlpha`
      // when a label survives, so this exercises that branch rather than the
      // `survivorIds`-driven one the cull test above pins). Must ease, not
      // pop, and the render-loop wake vote must go quiet once settled.
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      let fadeAlpha = 1;
      dir.registerProducer({
        id: 'p',
        produceLabels: () => ({ labels: [{ ...SAMPLE_LABEL, fadeAlpha }], awake: false }),
      });

      const lastAlphaOf = (): number | undefined =>
        (labelStub.setLabels.mock.calls.at(-1)![0] as Label2D[]).find(
          (l) => l.id === SAMPLE_LABEL.id,
        )?.fadeAlpha;

      // Frame 1: seeds AT target 1 — no ramp yet, so the wake vote is quiet.
      expect(dir.runFrame(makeState(), makeNear0Ctx(0))).toBe(false);
      expect(lastAlphaOf()).toBe(1);

      // Demand drops: the producer's own fadeAlpha falls to 0, though the
      // label is still emitted every frame. A short dt later the filter has
      // only PARTLY eased down (strictly between 0 and 1), and the mid-ramp
      // frame wakes the loop.
      fadeAlpha = 0;
      expect(dir.runFrame(makeState(), makeNear0Ctx(50))).toBe(true);
      const mid = lastAlphaOf();
      expect(mid).toBeGreaterThan(0);
      expect(mid!).toBeLessThan(1);

      // Far enough later the filter settles exactly on 0 — the label drops
      // from the flush and the wake vote goes quiet again.
      expect(dir.runFrame(makeState(), makeNear0Ctx(5050))).toBe(false);
      expect(lastAlphaOf()).toBeUndefined();
    });

    it('the higher caption priority survives a NEAR0 collision', () => {
      // `declutterPriority` composed exactly as `produceConstellationCaptions` and
      // `produceLightTimeCaptions` do — `priority * CAPTION_PRIORITY_SCALE` — so the
      // authored priority dominates the collision regardless of any size term.
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      const bodyLabel: Label2D = {
        ...SAMPLE_LABEL,
        id: 'planet',
        declutterPriority: 20 * CAPTION_PRIORITY_SCALE,
        fadeAlpha: 1,
      };
      const constellationLabel: Label2D = {
        ...SAMPLE_LABEL,
        id: 'orion',
        declutterPriority: 5 * CAPTION_PRIORITY_SCALE,
        fadeAlpha: 1,
      };
      // Same anchor — guarantees the collision the priority must resolve.
      dir.registerProducer(makeProducer('p', [bodyLabel, constellationLabel]));

      dir.runFrame(makeState(), makeNear0Ctx(0));
      const flushedIds = (labelStub.setLabels.mock.calls.at(-1)![0] as Label2D[]).map((l) => l.id);
      expect(flushedIds).toContain('planet');
      expect(flushedIds).not.toContain('orion');
    });

    it('a caption standing under a lifted planet caption survives: the cull reads where the text is drawn', () => {
      // The Curiosity case: a rover at the sub-camera point projects within a
      // pixel of its host planet's anchor, but the planet's text is lifted
      // 1.5x its apparent diameter up the screen. A cull at the pre-lift
      // anchors drops the rover against text 600 px away.
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      const planet: Label2D = {
        ...SAMPLE_LABEL,
        id: 'mars',
        declutterPriority: 20 * CAPTION_PRIORITY_SCALE,
        fadeAlpha: 1,
        // 400 px across at the centre's unit depth.
        lift: { radiusMpc: 200 / makeNear0Ctx().drawPxPerRad, leader: RIM_LEADER },
      };
      const rover: Label2D = {
        ...SAMPLE_LABEL,
        id: 'curiosity',
        worldPos: [0, -0.002, 0],
        declutterPriority: 12 * CAPTION_PRIORITY_SCALE,
        fadeAlpha: 1,
        lift: { radiusMpc: 0, leader: RIM_LEADER },
      };
      dir.registerProducer(makeProducer('p', [planet, rover]));

      dir.runFrame(makeState(), makeNear0Ctx(0));
      const flushedIds = (labelStub.setLabels.mock.calls.at(-1)![0] as Label2D[]).map((l) => l.id);
      expect(flushedIds).toContain('mars');
      expect(flushedIds).toContain('curiosity');
    });

    it('two long names whose anchors are far apart but whose texts overlap keep only one', () => {
      // The stellar-streams case: `Cetus-New` and `AAU-ATLAS` anchored 60 px
      // apart, each name several times wider than that.
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      const name = (id: string, x: number, declutterPriority: number): Label2D => ({
        ...SAMPLE_LABEL,
        id,
        text: 'Cetus-New',
        worldPos: [x, 0, 0],
        minPixelSize: 30,
        declutterPriority,
        fadeAlpha: 1,
      });
      dir.registerProducer(makeProducer('p', [name('kept', 0, 2), name('culled', 0.12, 1)]));

      dir.runFrame(makeState(), makeNear0Ctx(0));
      const flushedIds = (labelStub.setLabels.mock.calls.at(-1)![0] as Label2D[]).map((l) => l.id);
      expect(flushedIds).toEqual(['kept']);
    });

    it('smoothstepRamp keeps flushing a remembered emission until the ramp hits 0 (mirrors the exponential absence test above)', () => {
      // An ad hoc config: smoothstepRamp without COSMO's other settings,
      // pinning that its absence rule did NOT get swapped for
      // exponentialApproach's (spec §12: the two rules are the most plausible
      // port error, and swapping them is invisible in a settled frame).
      const config: Label2DDirectorConfig = {
        project: identityLabelProjection,
        declutterPadPx: 8,
        declutterLift: 'drawn',
        envelope: { mode: 'smoothstepRamp', durationMs: 300 },
      };
      const dir = createLabel2DDirector(config, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      dir.attachRenderers(labelStub as never, defaultMeasure);

      let labels: Label2D[] = [SAMPLE_LABEL];
      dir.registerProducer({ id: 'p', produceLabels: () => ({ labels, awake: false }) });

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(300)); // fully in

      labels = []; // producer stops emitting — the envelope's tail takes over
      dir.runFrame(makeState(), makeCtx(400)); // transition frame: tail starts from alpha 1
      dir.runFrame(makeState(), makeCtx(550)); // halfway out — remembered label at 0.5
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([{ ...SAMPLE_LABEL, fadeAlpha: 0.5 }]);

      dir.runFrame(makeState(), makeCtx(700)); // ramp complete → dropped
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([]);
    });

    it('a label without a lift field is emitted unlifted (the constellation-shaped case, by data absence)', () => {
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR, VIEW_RIGS.mono);
      const labelStub = makeLabelStub();
      const measure = vi.fn(defaultMeasure);
      dir.attachRenderers(labelStub as never, measure);

      // No `lift` field, no `kind` discriminant anywhere in sight — the
      // constellation caption's shape, not its label.
      const constellationLike: Label2D = { ...SAMPLE_LABEL, fadeAlpha: 1 };
      dir.registerProducer(makeProducer('p', [constellationLike]));

      dir.runFrame(makeState(), makeNear0Ctx(0));

      // Once, by the declutter.
      expect(measure).toHaveBeenCalledTimes(1);
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([constellationLike]);
    });
  });
});
