import { describe, expect, it, vi } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import { ATLAS_FONT_SIZE } from '../../../../src/data/fonts';
import { createLabelDirectorSubsystem } from '../../../../src/services/engine/subsystems/labelDirectorSubsystem';
import type { LabelProducer } from '../../../../src/@types/engine/subsystems/LabelProducer';
import type { Label } from '../../../../src/@types/rendering/Label';
import type { MarkerLine } from '../../../../src/@types/rendering/MarkerLine';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
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

function makeProducer(
  id: string,
  labels: Label[],
  lines: MarkerLine[],
  awake = false,
): LabelProducer {
  return { id, produceLabels: () => ({ labels, lines, awake }) };
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
    measure: vi.fn<(label: Label) => { minX: number; minY: number; maxX: number; maxY: number }>(
      (label) => ({ minX: 0, minY: -30, maxX: 20 * label.text.length, maxY: 0 }),
    ),
  };
}
function makeLineStub() {
  return { setLines: vi.fn(), render: vi.fn(), lineCount: () => 0, destroy: vi.fn() };
}

/** Every setLabels flush in call order — for asserting alpha trajectories. */
function flushedLabels(stub: ReturnType<typeof makeLabelStub>): Label[][] {
  return stub.setLabels.mock.calls.map((c) => c[0] as Label[]);
}

const SAMPLE_LABEL: Label = {
  id: 'sample-label',
  worldPos: [0, 0, 0],
  text: 'x',
  font: 'cormorant',
  pixelSize: 10,
};
const SAMPLE_LINE: MarkerLine = {
  id: 'sample-line',
  fromWorld: [0, 0, 0],
  toWorld: [1, 0, 0],
  pixelWidth: 1,
  color: [1, 1, 1, 1],
};

describe('labelDirectorSubsystem', () => {
  it('no-ops when renderers are not attached', () => {
    const dir = createLabelDirectorSubsystem();
    dir.registerProducer(makeProducer('p', [SAMPLE_LABEL], [SAMPLE_LINE]));
    expect(() => dir.runFrame(makeState(), makeCtx())).not.toThrow();
  });

  it('merges labels and lines from multiple producers', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    // Distinct world positions so the two anchors don't collide on screen.
    const a: Label = { ...SAMPLE_LABEL, id: 'a', worldPos: [-0.5, 0, 0] };
    const b: Label = { ...SAMPLE_LABEL, id: 'b', worldPos: [0.5, 0, 0] };
    const la: MarkerLine = { ...SAMPLE_LINE, id: 'la' };
    const lb: MarkerLine = { ...SAMPLE_LINE, id: 'lb' };
    dir.registerProducer(makeProducer('pa', [a], [la]));
    dir.registerProducer(makeProducer('pb', [b], [lb]));

    // First frame enters at envelope alpha 0; run a second frame past the
    // 300 ms ramp so the flush carries the producers' labels at full alpha.
    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([a, b]);
    // Lines without an ownerLabelId survive declutter unconditionally and
    // bypass the envelope entirely.
    expect(lineStub.setLines).toHaveBeenLastCalledWith([la, lb]);
  });

  it('skips re-uploading the same merged set across frames once settled', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);
    dir.registerProducer(makeProducer('p', [SAMPLE_LABEL], [SAMPLE_LINE]));

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
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);
    dir.registerProducer(makeProducer('p', [], [], true));

    expect(dir.runFrame(makeState(), makeCtx())).toBe(true);
  });

  it('re-uploads when a label or line fadeAlpha changes (smooth fade transitions)', () => {
    // Regression test for the youAreHere fade band: the marker line
    // and label share the same id across the fade band while fadeAlpha
    // smoothly transitions.  If the signature only watched id+count,
    // the GPU instance buffer would stay stuck at the first-frame
    // fadeAlpha and the marker would appear at the wrong opacity.
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    // Producer whose output flips fadeAlpha between calls but keeps
    // the same id (same scenario as youAreHere mid-fade).
    let alpha = 0.3;
    const producer: LabelProducer = {
      id: 'p',
      produceLabels: () => ({
        labels: [{ ...SAMPLE_LABEL, fadeAlpha: alpha }],
        lines: [{ ...SAMPLE_LINE, fadeAlpha: alpha }],
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

  it('re-uploads a marker line when its endpoints move', () => {
    // Regression test for the famous-galaxy leader line: `labelLeaderLine`
    // derives the connector's toWorld from the camera each frame, so the
    // endpoints move while id and fadeAlpha stay constant.  If the signature
    // ignored endpoints, the GPU buffer would freeze the connector at
    // whatever geometry was uploaded the first visible frame.
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    // Unowned line (bypasses the appear/disappear envelope) whose toWorld
    // the producer moves between frames — the camera-derived connector case.
    let tipY = 0.5;
    const producer: LabelProducer = {
      id: 'p',
      produceLabels: () => ({
        labels: [],
        lines: [{ ...SAMPLE_LINE, toWorld: [0, tipY, 0] }],
        awake: false,
      }),
    };
    dir.registerProducer(producer);

    dir.runFrame(makeState(), makeCtx(0));
    expect(lineStub.setLines).toHaveBeenCalledTimes(1);

    dir.runFrame(makeState(), makeCtx(100)); // identical endpoints → skip
    expect(lineStub.setLines).toHaveBeenCalledTimes(1);

    tipY = 0.6; // camera moved: the lifted tip lands elsewhere in world space
    dir.runFrame(makeState(), makeCtx(200));
    expect(lineStub.setLines).toHaveBeenCalledTimes(2);
    expect(lineStub.setLines).toHaveBeenLastCalledWith([{ ...SAMPLE_LINE, toWorld: [0, 0.6, 0] }]);
  });

  it('re-uploads a label when its lifted anchor moves while its lines are absent', () => {
    // Regression test for the suppressed-line gap: labels are placed by a
    // screen-space lift (`liftedLabelPlacement`), so a lifted label's anchor
    // is camera-derived and moves each frame while id and fadeAlpha stay
    // constant.  When the lift SUPPRESSES the owned leader line (height ≤ 0)
    // and no other line moves, nothing but the label's own `worldPos` keys
    // the motion — without it in the signature the anchor would freeze and
    // reproject/drift over the glyphs under orbit.
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    let anchorY = 0;
    const producer: LabelProducer = {
      id: 'p',
      produceLabels: () => ({
        labels: [{ ...SAMPLE_LABEL, worldPos: [0, anchorY, 0] }],
        lines: [], // owned line suppressed — no line re-upload masks a stale anchor
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
    const dir = createLabelDirectorSubsystem();
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
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    // Two labels at the same world point (both project to screen centre, so
    // within the 48 px margin). The higher-prominence one wins; the loser's
    // anchor line (ownerLabelId) is dropped with it.
    const big: Label = { ...SAMPLE_LABEL, id: 'big', prominencePx: 100 };
    const small: Label = { ...SAMPLE_LABEL, id: 'small', prominencePx: 10 };
    const bigLine: MarkerLine = { ...SAMPLE_LINE, id: 'big-anchor', ownerLabelId: 'big' };
    const smallLine: MarkerLine = { ...SAMPLE_LINE, id: 'small-anchor', ownerLabelId: 'small' };
    dir.registerProducer(makeProducer('pbig', [big], [bigLine]));
    dir.registerProducer(makeProducer('psmall', [small], [smallLine]));

    // The culled label never enters the envelope (it sits below declutter),
    // so only the winner fades in; settle past the ramp and assert.
    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([big]);
    expect(lineStub.setLines).toHaveBeenLastCalledWith([bigLine]);
  });

  describe('rect-based declutter geometry', () => {
    // Both tests pin the projected em height to exactly ATLAS_FONT_SIZE
    // (min = max clamp), so measured atlas px map 1:1 to screen px and
    // the rects below can be reasoned about in plain pixels.
    const RECT_LABEL: Label = {
      ...SAMPLE_LABEL,
      minPixelSize: ATLAS_FONT_SIZE,
      maxPixelSize: ATLAS_FONT_SIZE,
      worldEmMpc: 1,
    };

    it('keeps a label whose anchor is near another but whose text rect is clear of it', () => {
      const dir = createLabelDirectorSubsystem();
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      // Baseline-aligned text: the rect spans 30 px UP from the anchor.
      labelStub.measure.mockImplementation(() => ({ minX: -50, minY: -30, maxX: 50, maxY: 0 }));

      // B sits 40 screen px BELOW A (screen y 500 → 540). Anchor distance is
      // inside the old 48 px point margin, but A's text occupies y∈[470,500]
      // and B's y∈[510,540] — visually clear. Neither may be culled.
      const a: Label = { ...RECT_LABEL, id: 'a', worldPos: [0, 0, 0], prominencePx: 100 };
      const b: Label = { ...RECT_LABEL, id: 'b', worldPos: [0, -0.08, 0], prominencePx: 10 };
      dir.registerProducer(makeProducer('p', [a, b], []));

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(300));
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([a, b]);
    });

    it('culls the lower-prominence label when wide text rects overlap despite distant anchors', () => {
      const dir = createLabelDirectorSubsystem();
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      // Wide centered text: 300 px across the anchor.
      labelStub.measure.mockImplementation(() => ({ minX: -150, minY: -15, maxX: 150, maxY: 15 }));

      // B sits 100 screen px RIGHT of A (screen x 500 → 600) — outside the
      // old 48 px point margin, but the 300 px-wide rects overlap by 200 px.
      const a: Label = { ...RECT_LABEL, id: 'a', worldPos: [0, 0, 0], prominencePx: 100 };
      const b: Label = { ...RECT_LABEL, id: 'b', worldPos: [0.2, 0, 0], prominencePx: 10 };
      dir.registerProducer(makeProducer('p', [a, b], []));

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(300));
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([a]);
    });
  });

  it('never drops or blocks off-screen labels', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    // On-screen low-prominence label + an off-screen label (|x| > 1 → outside
    // NDC). The off-screen one is accepted unconditionally and never blocks.
    const onScreen: Label = { ...SAMPLE_LABEL, id: 'on', prominencePx: 1, worldPos: [0, 0, 0] };
    const offScreen: Label = { ...SAMPLE_LABEL, id: 'off', prominencePx: 999, worldPos: [5, 0, 0] };
    dir.registerProducer(makeProducer('p', [onScreen, offScreen], []));

    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([onScreen, offScreen]);
  });

  it('no longer fires any layer load-in fade on a non-empty flush', () => {
    // The per-category structure load-in lives in produceStructureLabels;
    // the director must not call fades.fadeTo on its own.
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);
    dir.registerProducer(makeProducer('p', [SAMPLE_LABEL], [SAMPLE_LINE]));

    const state = makeState();
    dir.runFrame(state, makeCtx());
    expect(state.subsystems.fades.fadeTo as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('treats a label with no prominencePx as prominence 0', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    // A label that omits prominencePx collides with a prominent structure
    // label at the same point → loses the overlap; its stem line drops with
    // it.  (The Milky Way "You are here" avoids this fate by declaring
    // prominencePx: Number.MAX_VALUE — see produceMilkyWayLabel.)
    const anonymous: Label = { ...SAMPLE_LABEL, id: 'anonymous' };
    const anonLine: MarkerLine = {
      ...SAMPLE_LINE,
      id: 'anonymous',
      ownerLabelId: 'anonymous',
    };
    const structure: Label = { ...SAMPLE_LABEL, id: 'coma', prominencePx: 200 };
    dir.registerProducer(makeProducer('anon', [anonymous], [anonLine]));
    dir.registerProducer(makeProducer('struct', [structure], []));

    dir.runFrame(makeState(), makeCtx(0));
    dir.runFrame(makeState(), makeCtx(300));
    expect(labelStub.setLabels).toHaveBeenLastCalledWith([structure]);
    expect(lineStub.setLines).toHaveBeenLastCalledWith([]);
  });

  describe('appear/disappear envelope', () => {
    it('fades a newly appearing label in over the 300 ms ramp (smoothstep of nowMs)', () => {
      const dir = createLabelDirectorSubsystem();
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);
      dir.registerProducer(makeProducer('p', [SAMPLE_LABEL], []));

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
      const dir = createLabelDirectorSubsystem();
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      let labels: Label[] = [SAMPLE_LABEL];
      dir.registerProducer({ id: 'p', produceLabels: () => ({ labels, lines: [], awake: false }) });

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
      const dir = createLabelDirectorSubsystem();
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);
      const dimmed: Label = { ...SAMPLE_LABEL, fadeAlpha: 0.5 };
      dir.registerProducer(makeProducer('p', [dimmed], []));

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(150));
      dir.runFrame(makeState(), makeCtx(300));

      const flushes = flushedLabels(labelStub);
      expect(flushes[0]![0]!.fadeAlpha).toBe(0); // 0.5 × 0
      expect(flushes[1]![0]!.fadeAlpha).toBe(0.25); // 0.5 × 0.5
      expect(flushes[2]![0]!.fadeAlpha).toBe(0.5); // 0.5 × 1 — producer value survives
    });

    it('routes an owned marker line through its label envelope, including the fade-out tail', () => {
      const dir = createLabelDirectorSubsystem();
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      const owner: Label = { ...SAMPLE_LABEL, id: 'owner' };
      const stem: MarkerLine = { ...SAMPLE_LINE, id: 'stem', ownerLabelId: 'owner' };
      let out: { labels: Label[]; lines: MarkerLine[] } = { labels: [owner], lines: [stem] };
      dir.registerProducer({ id: 'p', produceLabels: () => ({ ...out, awake: false }) });

      dir.runFrame(makeState(), makeCtx(0));
      dir.runFrame(makeState(), makeCtx(150)); // fade-in midpoint — line follows its label
      expect(lineStub.setLines).toHaveBeenLastCalledWith([{ ...stem, fadeAlpha: 0.5 }]);

      dir.runFrame(makeState(), makeCtx(300)); // settled — line passes through untouched
      expect(lineStub.setLines).toHaveBeenLastCalledWith([stem]);

      out = { labels: [], lines: [] }; // both disappear together
      dir.runFrame(makeState(), makeCtx(450)); // tail begins from alpha 1
      dir.runFrame(makeState(), makeCtx(600)); // halfway out — remembered line re-emitted
      expect(lineStub.setLines).toHaveBeenLastCalledWith([{ ...stem, fadeAlpha: 0.5 }]);
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([{ ...owner, fadeAlpha: 0.5 }]);

      dir.runFrame(makeState(), makeCtx(750)); // tail complete → label and line drop together
      expect(labelStub.setLabels).toHaveBeenLastCalledWith([]);
      expect(lineStub.setLines).toHaveBeenLastCalledWith([]);
    });

    it('keeps the loop awake while any envelope ramps, and goes quiet once settled', () => {
      const dir = createLabelDirectorSubsystem();
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      let labels: Label[] = [SAMPLE_LABEL];
      // Producer is never awake — every vote below comes from the envelope.
      dir.registerProducer({ id: 'p', produceLabels: () => ({ labels, lines: [], awake: false }) });

      expect(dir.runFrame(makeState(), makeCtx(0))).toBe(true); // fade-in in flight
      expect(dir.runFrame(makeState(), makeCtx(150))).toBe(true); // still ramping
      expect(dir.runFrame(makeState(), makeCtx(300))).toBe(false); // settled → quiet

      labels = [];
      expect(dir.runFrame(makeState(), makeCtx(400))).toBe(true); // fade-out tail in flight
      expect(dir.runFrame(makeState(), makeCtx(700))).toBe(false); // tail complete → quiet again
    });

    it('resumes from the current alpha when a label reappears mid-fade-out (no pop either way)', () => {
      const dir = createLabelDirectorSubsystem();
      const labelStub = makeLabelStub();
      const lineStub = makeLineStub();
      dir.attachRenderers(labelStub as never, lineStub as never);

      let labels: Label[] = [SAMPLE_LABEL];
      dir.registerProducer({ id: 'p', produceLabels: () => ({ labels, lines: [], awake: false }) });

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
});
