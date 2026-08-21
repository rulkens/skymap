import { describe, expect, it, vi } from 'vitest';
import { mat4, mat4d } from 'wgpu-matrix';
import { ATLAS_FONT_SIZE } from '../../../../src/data/fonts';
import { createLabel2DDirector } from '../../../../src/services/engine/subsystems/label2DDirector';
import {
  COSMO_LABEL_DIRECTOR,
  FOREGROUND_LABEL_DIRECTOR,
} from '../../../../src/services/engine/engine';
import { cosmoLabelProjection } from '../../../../src/services/engine/frame/cosmoLabelProjection';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import {
  CAPTION_PRIORITY,
  CAPTION_TIER_SCALE,
} from '../../../../src/services/engine/presentation/captionPriority';
import type { Label2DProducer } from '../../../../src/@types/engine/subsystems/Label2DProducer';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { Label2DLeader } from '../../../../src/@types/rendering/Label2DLeader';
import type { Label2DDirectorConfig } from '../../../../src/@types/engine/subsystems/Label2DDirectorConfig';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeState(): EngineState {
  // The director fires no layer load-in (each producer owns its own), but
  // the stub keeps a `fades.fadeTo` spy so tests can assert the director
  // never calls it.
  return {
    subsystems: { fades: { fadeTo: vi.fn() } },
  } as unknown as EngineState;
}

// Identity vp + 1000×1000 canvas: a label at world [x,y,0] projects to screen
// ((x·0.5+0.5)·1000, (1−(y·0.5+0.5))·1000). So [0,0,0] → centre (500,500);
// |x| or |y| ≥ ~0.1 separates two anchors past the 48 px declutter margin;
// |x| or |y| > 1 lands the anchor off-screen (never dropped, never blocks).
//
// `nowMs` is the frame's stamped clock: the appear/disappear envelope is a
// pure function of it, so tests step time by passing explicit stamps.  The
// envelope ramp is 300 ms of smoothstep, so 0 / 150 / 300 hit alpha
// 0 / 0.5 / 1 exactly.
function makeCtx(nowMs = 0): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, 0],
    vp: mat4.identity(),
    canvasSize: { width: 1000, height: 1000 },
    nowMs,
  } as unknown as ReadyFrameContext;
}

// The FOREGROUND_LABEL_DIRECTOR's `project` (`near0LabelProjection`) rebases
// `ctx.slabs[NEAR0].vp` about `ctx.drawCamPos` in f64. An identity slab vp +
// zero cam position rebases to identity too, so this ctx behaves exactly
// like `makeCtx`'s COSMO one for screen math — same [x,y,0] → screen mapping.
const NEAR0_SLAB: Slab = {
  index: NEAR0,
  nearMpc: 1e-6,
  farMpc: 1,
  vp: mat4d.identity() as Float64Array,
  originRelative: true,
  precision: 'f64',
  reversedZ: true,
};

function makeNear0Ctx(nowMs = 0): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, 0],
    slabs: [NEAR0_SLAB],
    canvasSize: { width: 1000, height: 1000 },
    nowMs,
  } as unknown as ReadyFrameContext;
}

function makeProducer(id: string, labels: Label2D[], awake = false): Label2DProducer {
  return { id, produceLabels: () => ({ labels, awake }) };
}

function makeLabelStub() {
  return {
    setLabels: vi.fn(),
    render: vi.fn(),
    glyphCount: () => 0,
    labelCount: () => 0,
    destroy: vi.fn(),
    // Default measure: a modest single-line box extending up from the
    // baseline anchor (text sits above `worldPos`), 20 atlas px per
    // character.  Rect-declutter tests override this per label.
    measure: vi.fn<(label: Label2D) => { minX: number; minY: number; maxX: number; maxY: number }>(
      (label) => ({ minX: 0, minY: -30, maxX: 20 * label.text.length, maxY: 0 }),
    ),
  };
}
function makeLineStub() {
  return { setLines: vi.fn(), render: vi.fn(), lineCount: () => 0, destroy: vi.fn() };
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
const SAMPLE_LEADER: Label2DLeader = {
  fromWorld: [0, 0, 0],
  toWorld: [1, 0, 0],
  pixelWidth: 1,
  color: [1, 1, 1, 1],
};

describe('label2DDirector', () => {
  it('no-ops when renderers are not attached', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    dir.registerProducer(makeProducer('p', [{ ...SAMPLE_LABEL, leader: SAMPLE_LEADER }]));
    expect(() => dir.runFrame(makeState(), makeCtx())).not.toThrow();
  });

  it('merges labels from multiple producers', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    // Distinct world positions so the two anchors don't collide on screen.
    const a: Label2D = { ...SAMPLE_LABEL, id: 'a', worldPos: [-0.5, 0, 0] };
    const b: Label2D = { ...SAMPLE_LABEL, id: 'b', worldPos: [0.5, 0, 0] };
    dir.registerProducer(makeProducer('pa', [a]));
    dir.registerProducer(makeProducer('pb', [b]));

    // First frame enters at envelope alpha 0; run a second frame past the
    // 300 ms ramp so the flush carries the producers' labels at full alpha.
    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([a, b]);
    // Neither label carries a leader, so no lines synthesize.
    expect(lineStub.setLines).toHaveBeenLastCalledWith([]);
  });

  it('skips re-uploading the same merged set across frames once settled', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);
    dir.registerProducer(makeProducer('p', [{ ...SAMPLE_LABEL, leader: SAMPLE_LEADER }]));

    // The envelope animates alpha during the first 300 ms, so flushes
    // legitimately repeat while ramping; the signature skip is asserted
    // AFTER everything settles.
    dir.runFrame(makeState(), makeCtx(0)); // enter at alpha 0
    dir.runFrame(makeState(), makeCtx(300)); // settled at alpha 1
    dir.runFrame(makeState(), makeCtx(600)); // identical settled set → skip
    expect(labelStub.setLabels).toHaveBeenCalledTimes(2);
    expect(lineStub.setLines).toHaveBeenCalledTimes(2);
  });

  it('reports the vote when any producer is awake', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);
    dir.registerProducer(makeProducer('p', [], true));

    expect(dir.runFrame(makeState(), makeCtx())).toBe(true);
  });

  it('re-uploads when a label fadeAlpha changes (smooth fade transitions)', () => {
    // Regression test for the youAreHere fade band: the marker line
    // synthesizes from the label's own fadeAlpha, so a producer that flips
    // fadeAlpha at a fixed id must re-upload both. If the signature only
    // watched id+count, the GPU instance buffer would stay stuck at the
    // first-frame fadeAlpha and the marker would appear at the wrong
    // opacity.
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    // Producer whose output flips fadeAlpha between calls but keeps
    // the same id (same scenario as youAreHere mid-fade).
    let alpha = 0.3;
    const producer: Label2DProducer = {
      id: 'p',
      produceLabels: () => ({
        labels: [{ ...SAMPLE_LABEL, leader: SAMPLE_LEADER, fadeAlpha: alpha }],
        awake: alpha > 0 && alpha < 1,
      }),
    };
    dir.registerProducer(producer);

    dir.runFrame(makeState(), makeCtx(0)); // envelope 0 × 0.3 = 0
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);
    expect(lineStub.setLines).toHaveBeenCalledTimes(1);

    dir.runFrame(makeState(), makeCtx(300)); // envelope settled → 0.3
    expect(labelStub.setLabels).toHaveBeenCalledTimes(2);
    expect(lineStub.setLines).toHaveBeenCalledTimes(2);

    alpha = 0.7;
    dir.runFrame(makeState(), makeCtx(400)); // producer alpha change → 0.7
    expect(labelStub.setLabels).toHaveBeenCalledTimes(3);
    expect(lineStub.setLines).toHaveBeenCalledTimes(3);

    // Settling at the same fadeAlpha should NOT re-upload — the
    // signature optimization still skips identical frames.
    dir.runFrame(makeState(), makeCtx(500));
    expect(labelStub.setLabels).toHaveBeenCalledTimes(3);
    expect(lineStub.setLines).toHaveBeenCalledTimes(3);
  });

  it("re-flushes when a leader's toWorld moves at fixed id and alpha", () => {
    // Pins the fold's landmine: signatureOf's separate line term collapsed
    // onto the label term, but must still key the leader's `toWorld` — the
    // camera-derived leader endpoint (`labelLeaderLine`) moves every frame
    // the camera does while the label's id, worldPos, and fadeAlpha stay
    // constant. Without this term the connector would freeze at whatever
    // geometry was uploaded the first visible frame.
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    let tipY = 0.5;
    const producer: Label2DProducer = {
      id: 'p',
      produceLabels: () => ({
        labels: [{ ...SAMPLE_LABEL, leader: { ...SAMPLE_LEADER, toWorld: [0, tipY, 0] } }],
        awake: false,
      }),
    };
    dir.registerProducer(producer);

    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300)); // settle
    const settledCalls = lineStub.setLines.mock.calls.length;

    dir.runFrame(makeState(), makeCtx(600)); // identical endpoints → skip
    expect(lineStub.setLines.mock.calls.length).toBe(settledCalls);

    tipY = 0.6; // camera moved: the leader's tip lands elsewhere in world space
    dir.runFrame(makeState(), makeCtx(900));
    expect(lineStub.setLines.mock.calls.length).toBe(settledCalls + 1);
    expect(lineStub.setLines).toHaveBeenLastCalledWith([
      {
        id: 'sample-label-anchor',
        fromWorld: SAMPLE_LEADER.fromWorld,
        toWorld: [0, 0.6, 0],
        pixelWidth: SAMPLE_LEADER.pixelWidth,
        color: SAMPLE_LEADER.color,
        fadeAlpha: 1,
      },
    ]);
  });

  it('re-uploads a label when its lifted anchor moves while it carries no leader', () => {
    // Regression test for the suppressed-line gap: labels are placed by a
    // screen-space lift (`liftedLabelPlacement`), so a lifted label's anchor
    // is camera-derived and moves each frame while id and fadeAlpha stay
    // constant. When the lift SUPPRESSES the leader (height ≤ 0) and no
    // leader endpoint moves, nothing but the label's own `worldPos` keys
    // the motion — without it in the signature the anchor would freeze and
    // reproject/drift over the glyphs under orbit.
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    let anchorY = 0;
    const producer: Label2DProducer = {
      id: 'p',
      produceLabels: () => ({
        labels: [{ ...SAMPLE_LABEL, worldPos: [0, anchorY, 0] }], // no leader — suppressed
        awake: false,
      }),
    };
    dir.registerProducer(producer);

    dir.runFrame(makeState(), makeCtx(0)); // enter at envelope alpha 0
    dir.runFrame(makeState(), makeCtx(300)); // settle at alpha 1
    const settledCalls = labelStub.setLabels.mock.calls.length;

    dir.runFrame(makeState(), makeCtx(600)); // identical settled anchor → skip
    expect(labelStub.setLabels.mock.calls.length).toBe(settledCalls);

    anchorY = 0.3; // camera moved: the lifted anchor lands elsewhere in world space
    dir.runFrame(makeState(), makeCtx(900));
    expect(labelStub.setLabels.mock.calls.length).toBe(settledCalls + 1);
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([
      { ...SAMPLE_LABEL, worldPos: [0, 0.3, 0] },
    ]);
  });

  it('flushes empty when no producers contribute, then skips subsequent empties', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(100));
    // First call writes []; second call's signature matches, skip.
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);
    expect(labelStub.setLabels).toHaveBeenCalledWith([]);
  });

  it('declutters colliding on-screen labels across producers, keeping higher prominence', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    // Two labels at the same world point (both project to screen centre, so
    // within the 48 px margin). The higher-prominence one wins.
    const big: Label2D = { ...SAMPLE_LABEL, id: 'big', prominencePx: 100 };
    const small: Label2D = { ...SAMPLE_LABEL, id: 'small', prominencePx: 10 };
    dir.registerProducer(makeProducer('pbig', [big]));
    dir.registerProducer(makeProducer('psmall', [small]));

    // The culled label never enters the envelope (it sits below declutter),
    // so only the winner fades in; settle past the ramp and assert.
    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([big]);
  });

  it("drops a culled label's leader with it", () => {
    // A culled label takes its leader with it BY CONSTRUCTION now that the
    // leader lives on the label object — declutter no longer needs a
    // separate line-filter pass.
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    const big: Label2D = { ...SAMPLE_LABEL, id: 'big', prominencePx: 100, leader: SAMPLE_LEADER };
    const small: Label2D = {
      ...SAMPLE_LABEL,
      id: 'small',
      prominencePx: 10,
      leader: SAMPLE_LEADER,
    };
    dir.registerProducer(makeProducer('pbig', [big]));
    dir.registerProducer(makeProducer('psmall', [small]));

    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    expect(lineStub.setLines).toHaveBeenLastCalledWith([
      {
        id: 'big-anchor',
        fromWorld: SAMPLE_LEADER.fromWorld,
        toWorld: SAMPLE_LEADER.toWorld,
        pixelWidth: SAMPLE_LEADER.pixelWidth,
        color: SAMPLE_LEADER.color,
        fadeAlpha: 1,
      },
    ]);
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
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      // Baseline-aligned text: the rect spans 30 px UP from the anchor.
      labelStub.measure.mockImplementation(() => ({ minX: -50, minY: -30, maxX: 50, maxY: 0 }));

      // B sits 40 screen px BELOW A (screen y 500 → 540). Anchor distance is
      // inside the old 48 px point margin, but A's text occupies y∈[470,500]
      // and B's y∈[510,540] — visually clear. Neither may be culled.
      const a: Label2D = { ...RECT_LABEL, id: 'a', worldPos: [0, 0, 0], prominencePx: 100 };
      const b: Label2D = { ...RECT_LABEL, id: 'b', worldPos: [0, -0.08, 0], prominencePx: 10 };
      dir.registerProducer(makeProducer('p', [a, b]));

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(300));
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([a, b]);
    });

    it('culls the lower-prominence label when wide text rects overlap despite distant anchors', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      // Wide centered text: 300 px across the anchor.
      labelStub.measure.mockImplementation(() => ({ minX: -150, minY: -15, maxX: 150, maxY: 15 }));

      // B sits 100 screen px RIGHT of A (screen x 500 → 600) — outside the
      // old 48 px point margin, but the 300 px-wide rects overlap by 200 px.
      const a: Label2D = { ...RECT_LABEL, id: 'a', worldPos: [0, 0, 0], prominencePx: 100 };
      const b: Label2D = { ...RECT_LABEL, id: 'b', worldPos: [0.2, 0, 0], prominencePx: 10 };
      dir.registerProducer(makeProducer('p', [a, b]));

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(300));
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([a]);
    });
  });

  it('never drops or blocks off-screen labels', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    // On-screen low-prominence label + an off-screen label (|x| > 1 → outside
    // NDC). The off-screen one is accepted unconditionally and never blocks.
    const onScreen: Label2D = { ...SAMPLE_LABEL, id: 'on', prominencePx: 1, worldPos: [0, 0, 0] };
    const offScreen: Label2D = {
      ...SAMPLE_LABEL,
      id: 'off',
      prominencePx: 999,
      worldPos: [5, 0, 0],
    };
    dir.registerProducer(makeProducer('p', [onScreen, offScreen]));

    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([onScreen, offScreen]);
  });

  it('no longer fires any layer load-in fade on a non-empty flush', () => {
    // The per-category structure load-in lives in produceStructureLabels;
    // the director must not call fades.fadeTo on its own.
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);
    dir.registerProducer(makeProducer('p', [SAMPLE_LABEL]));

    const state = makeState();
    dir.runFrame(state, makeCtx());
    expect(state.subsystems.fades.fadeTo as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('treats a label with no prominencePx as prominence 0', () => {
    const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    // A label that omits prominencePx collides with a prominent structure
    // label at the same point → loses the overlap; its leader drops with
    // it.  (The Milky Way "You are here" avoids this fate by declaring
    // prominencePx: Number.MAX_VALUE — see produceMilkyWayLabel.)
    const anonymous: Label2D = { ...SAMPLE_LABEL, id: 'anonymous', leader: SAMPLE_LEADER };
    const structure: Label2D = { ...SAMPLE_LABEL, id: 'coma', prominencePx: 200 };
    dir.registerProducer(makeProducer('anon', [anonymous]));
    dir.registerProducer(makeProducer('struct', [structure]));

    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([structure]);
    expect(lineStub.setLines).toHaveBeenLastCalledWith([]);
  });

  describe('appear/disappear envelope', () => {
    it('fades a newly appearing label in over the 300 ms ramp (smoothstep of nowMs)', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);
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
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

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
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);
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

    it("flushes a leader as a MarkerLine id'd `${label.id}-anchor` at the label's post-envelope alpha", () => {
      // Also covers the fade-out tail: the remembered label carries its
      // leader along, so the synthesized line fades out in lock-step
      // without any separate "owned lines" bookkeeping.
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      // fadeAlpha: 0.8 so the flushed line's alpha (envelope × producer) is
      // distinguishable from either factor alone.
      const owner: Label2D = {
        ...SAMPLE_LABEL,
        id: 'owner',
        leader: SAMPLE_LEADER,
        fadeAlpha: 0.8,
      };
      let out: { labels: Label2D[] } = { labels: [owner] };
      dir.registerProducer({ id: 'p', produceLabels: () => ({ ...out, awake: false }) });

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(150)); // fade-in midpoint: envelope 0.5 × producer 0.8
      expect(lineStub.setLines).toHaveBeenLastCalledWith([
        {
          id: 'owner-anchor',
          fromWorld: SAMPLE_LEADER.fromWorld,
          toWorld: SAMPLE_LEADER.toWorld,
          pixelWidth: SAMPLE_LEADER.pixelWidth,
          color: SAMPLE_LEADER.color,
          fadeAlpha: 0.4,
        },
      ]);

      dir.runFrame(makeState(), makeCtx(300)); // settled — envelope 1 × producer 0.8
      expect(lineStub.setLines).toHaveBeenLastCalledWith([
        {
          id: 'owner-anchor',
          fromWorld: SAMPLE_LEADER.fromWorld,
          toWorld: SAMPLE_LEADER.toWorld,
          pixelWidth: SAMPLE_LEADER.pixelWidth,
          color: SAMPLE_LEADER.color,
          fadeAlpha: 0.8,
        },
      ]);

      out = { labels: [] }; // label disappears — the fade-out tail takes over
      dir.runFrame(makeState(), makeCtx(450)); // tail begins from alpha 1
      dir.runFrame(makeState(), makeCtx(600)); // halfway out — remembered leader re-emitted
      expect(lineStub.setLines).toHaveBeenLastCalledWith([
        {
          id: 'owner-anchor',
          fromWorld: SAMPLE_LEADER.fromWorld,
          toWorld: SAMPLE_LEADER.toWorld,
          pixelWidth: SAMPLE_LEADER.pixelWidth,
          color: SAMPLE_LEADER.color,
          fadeAlpha: 0.4,
        },
      ]);
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([{ ...owner, fadeAlpha: 0.4 }]);

      dir.runFrame(makeState(), makeCtx(750)); // tail complete → label and line drop together
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([]);
      expect(lineStub.setLines).toHaveBeenLastCalledWith([]);
    });

    it('keeps the loop awake while any envelope ramps, and goes quiet once settled', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

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
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

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
    it('projects each label exactly once per frame', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      // Distinct world positions so both anchors are on-screen and neither
      // culls the other — isolates the count from declutter's collision logic.
      const a: Label2D = { ...SAMPLE_LABEL, id: 'a', worldPos: [-0.5, 0, 0] };
      const b: Label2D = { ...SAMPLE_LABEL, id: 'b', worldPos: [0.5, 0, 0] };
      dir.registerProducer(makeProducer('p', [a, b]));

      dir.runFrame(makeState(), makeCtx(0));

      // `measure` only runs inside the bboxOverlap arm's rect construction —
      // the one consumer of the shared per-label projected record. A count
      // above label count would mean a later stage re-projected instead of
      // reusing it.
      expect(labelStub.measure).toHaveBeenCalledTimes(2);
    });

    it('sorts by prominencePx descending with a stable input-order tiebreak', () => {
      const dir = createLabel2DDirector(COSMO_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      // Same world point, same prominence — the padded rects fully overlap,
      // so exactly one survives. Only registration order can break the tie.
      const first: Label2D = { ...SAMPLE_LABEL, id: 'first', prominencePx: 50 };
      const second: Label2D = { ...SAMPLE_LABEL, id: 'second', prominencePx: 50 };
      dir.registerProducer(makeProducer('p', [first, second]));

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(300));
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([first]);
    });
  });

  describe('the NEAR0 arms (spec §4.6, §4.4)', () => {
    it('exponentialApproach seeds a new id AT its target, not at 0', () => {
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

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
      // Mirrors `foregroundLabelsLayer.ts:269`'s candidate filter
      // (`baseTarget === 0 || screenPx === null` never enters the cull).
      // Without it, `zeroTarget`'s huge prominence would win the
      // screenSeparation contest and cull `visible` — which would then
      // never show, even though it has a real, positive target.
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      const zeroTarget: Label2D = {
        ...SAMPLE_LABEL,
        id: 'zero-target',
        prominencePx: 1000,
        fadeAlpha: 0,
      };
      const visible: Label2D = {
        ...SAMPLE_LABEL,
        id: 'visible',
        prominencePx: 1,
        fadeAlpha: 1,
      };
      dir.registerProducer(makeProducer('p', [zeroTarget, visible]));

      dir.runFrame(makeState(), makeNear0Ctx(0));

      // `visible` survives and seeds AT its target immediately; `zeroTarget`
      // never has anything to show (its own fadeAlpha is 0 either way).
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([visible]);
    });

    it('exponentialApproach drops an absent id immediately, with no remembered-emission tail', () => {
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

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

    it('a declutter-culled caption eases to 0 and eases back in, rather than popping', () => {
      // CRITICAL fix: a label declutter culls this frame is CULLED, not
      // ABSENT — its producer keeps emitting it every frame, so it must
      // stay in the exponential filter's universe (target 0) and ease
      // toward invisible, not vanish on the cull frame and re-seed at full
      // target the instant the cull flips back (`foregroundLabelsLayer.ts:306`
      // sets a culled entry's TARGET to 0 while it stays in `entries`,
      // pruned only when the producer itself stops emitting it, `:325-328`).
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      // `big` always wins a collision (higher prominence); its worldPos
      // toggles between far-from-`small` (no contest) and on top of it
      // (contest, `small` loses). `small` itself never moves and is always
      // emitted — declutter alone decides whether it's this frame's survivor.
      let bigPos: [number, number, number] = [5, 0, 0]; // off-screen-ish, no collision
      dir.registerProducer({
        id: 'p',
        produceLabels: () => ({
          labels: [
            { ...SAMPLE_LABEL, id: 'big', worldPos: bigPos, prominencePx: 100, fadeAlpha: 1 },
            { ...SAMPLE_LABEL, id: 'small', worldPos: [0, 0, 0], prominencePx: 10, fadeAlpha: 1 },
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
      // target (1) immediately.
      dir.runFrame(makeState(), makeNear0Ctx(0));
      expect(smallAlphaOf()).toBe(1);

      // Frame 2: `big` moves onto `small` — declutter culls `small` this
      // frame. It must EASE toward 0 (a fractional alpha), not pop straight
      // to absent.
      bigPos = [0, 0, 0];
      dir.runFrame(makeState(), makeNear0Ctx(50));
      const easingOut = smallAlphaOf();
      expect(easingOut).not.toBeUndefined();
      expect(easingOut!).toBeGreaterThan(0);
      expect(easingOut!).toBeLessThan(1);

      // Frame 3: still colliding, far enough later that the filter fully
      // settles at 0 — `small` finally drops out of the flush.
      dir.runFrame(makeState(), makeNear0Ctx(5050));
      expect(smallAlphaOf()).toBeUndefined();

      // Frame 4: the collision clears — `small` survives again. It must
      // ease BACK IN from wherever it left off (0), not snap straight to
      // its full target (1).
      bigPos = [5, 0, 0];
      dir.runFrame(makeState(), makeNear0Ctx(5100));
      const easingIn = smallAlphaOf();
      expect(easingIn).not.toBeUndefined();
      expect(easingIn!).toBeGreaterThan(0);
      expect(easingIn!).toBeLessThan(1);
    });

    it('eases a producer-driven target drop to 0 (demand fading, not a declutter cull), and the wake vote goes quiet once settled', () => {
      // Distinct from the cull case above: this label is NEVER contested —
      // it always survives declutter — but the PRODUCER's own `fadeAlpha`
      // falls to 0 (e.g. a caption's distance-band fade closing), moved from
      // `foregroundLabelsLayer.ts`'s demand-drop tail
      // (`declutterByScreenSeparationArm`'s target read is `label.fadeAlpha`
      // when a label survives, so this exercises that branch rather than the
      // `survivorIds`-driven one the cull test above pins). Must ease, not
      // pop, and the render-loop wake vote must go quiet once settled.
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

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

    it('the higher CAPTION_PRIORITY tier survives a screenSeparation collision', () => {
      // Moved from `foregroundLabelsLayer.ts`'s declutter, now exercised at
      // the director directly: `prominencePx` composed exactly as
      // `produceSceneBodyCaptions`/`produceConstellationCaptions` do —
      // `CAPTION_PRIORITY[kind] * CAPTION_TIER_SCALE` — so the tier ordering
      // dominates the collision regardless of any within-tier size term
      // (`captionPriority.ts`'s whole reason to exist).
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      const bodyLabel: Label2D = {
        ...SAMPLE_LABEL,
        id: 'planet',
        prominencePx: CAPTION_PRIORITY.planet * CAPTION_TIER_SCALE,
        fadeAlpha: 1,
      };
      const constellationLabel: Label2D = {
        ...SAMPLE_LABEL,
        id: 'orion',
        prominencePx: CAPTION_PRIORITY.constellation * CAPTION_TIER_SCALE,
        fadeAlpha: 1,
      };
      // Same anchor — guarantees the collision the tier ordering must resolve.
      dir.registerProducer(makeProducer('p', [bodyLabel, constellationLabel]));

      dir.runFrame(makeState(), makeNear0Ctx(0));
      const flushedIds = (labelStub.setLabels.mock.calls.at(-1)![0] as Label2D[]).map((l) => l.id);
      expect(flushedIds).toContain('planet');
      expect(flushedIds).not.toContain('orion');
    });

    it('smoothstepRamp keeps flushing a remembered emission until the ramp hits 0 (mirrors the exponential absence test above)', () => {
      // An ad hoc config pairing the NEW screenSeparation declutter arm with
      // the UNCHANGED smoothstepRamp envelope — not one of the two real
      // director instances, but a deliberate cross so this test exercises
      // this task's new declutter code while pinning that smoothstepRamp's
      // absence rule did NOT get swapped for exponentialApproach's (spec
      // §12: the two rules are the most plausible port error, and swapping
      // them is invisible in a settled frame).
      const config: Label2DDirectorConfig = {
        id: 'test-smoothstep-mirror',
        project: cosmoLabelProjection,
        declutter: { mode: 'screenSeparation', minSeparationPx: 48 },
        envelope: { mode: 'smoothstepRamp', durationMs: 300 },
        lift: null,
      };
      const dir = createLabel2DDirector(config);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

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

    it('the lift stage runs after the envelope, over survivors only', () => {
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      // Same world point (screen separation 0, well inside the 48 px margin)
      // — declutter culls one. Both carry `lift`, so if the lift stage ran
      // over the PRE-declutter set, `measure` would be called for both.
      const big: Label2D = {
        ...SAMPLE_LABEL,
        id: 'big',
        prominencePx: 100,
        fadeAlpha: 1,
        lift: { subjectSizePx: 10 },
      };
      const small: Label2D = {
        ...SAMPLE_LABEL,
        id: 'small',
        prominencePx: 10,
        fadeAlpha: 1,
        lift: { subjectSizePx: 10 },
      };
      // A THIRD label, at a screen position far from the other two (so
      // declutter never even considers it), whose producer target is 0.
      // `fadeAlpha: 1` everywhere else makes lift-before-envelope
      // indistinguishable from lift-after-envelope — this one only fails if
      // the lift runs before the `alpha > 0` skip drops it.
      const zeroTarget: Label2D = {
        ...SAMPLE_LABEL,
        id: 'zero',
        worldPos: [0.9, 0.9, 0],
        fadeAlpha: 0,
        lift: { subjectSizePx: 10 },
      };
      dir.registerProducer(makeProducer('p', [big, small, zeroTarget]));

      dir.runFrame(makeState(), makeNear0Ctx(0));

      // `measure` is called ONLY inside the lift stage for this director
      // (screenSeparation's declutter arm never reads it) — exactly one
      // call proves neither the declutter-culled label nor the
      // envelope-dropped (zero-target) label ever reached the lift.
      expect(labelStub.measure).toHaveBeenCalledTimes(1);
      expect(labelStub.measure).toHaveBeenCalledWith(big);
    });

    it('a label without a lift field is emitted unlifted (the constellation-shaped case, by data absence)', () => {
      const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      // No `lift` field, no `kind` discriminant anywhere in sight — the
      // constellation caption's shape, not its label.
      const constellationLike: Label2D = { ...SAMPLE_LABEL, fadeAlpha: 1 };
      dir.registerProducer(makeProducer('p', [constellationLike]));

      dir.runFrame(makeState(), makeNear0Ctx(0));

      expect(labelStub.measure).not.toHaveBeenCalled();
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([constellationLike]);
    });
  });
});
