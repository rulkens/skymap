import { describe, expect, it, vi } from 'vitest';
import { mat4 } from 'gl-matrix';
import { createLabelDirectorSubsystem } from '../../../../src/services/engine/subsystems/labelDirectorSubsystem';
import type { LabelProducer } from '../../../../src/@types/engine/subsystems/LabelProducer';
import type { Label } from '../../../../src/@types/rendering/Label';
import type { MarkerLine } from '../../../../src/@types/rendering/MarkerLine';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeState(requestRender: () => void = () => {}): EngineState {
  // The director fires no layer load-in (each producer owns its own), but
  // the stub keeps a `fades.fadeTo` spy so tests can assert the director
  // never calls it.
  return {
    subsystems: { scheduler: { requestRender }, fades: { fadeTo: vi.fn() } },
  } as unknown as EngineState;
}

// Identity vp + 1000×1000 canvas: a label at world [x,y,0] projects to screen
// ((x·0.5+0.5)·1000, (1−(y·0.5+0.5))·1000). So [0,0,0] → centre (500,500);
// |x| or |y| ≥ ~0.1 separates two anchors past the 48 px declutter margin;
// |x| or |y| > 1 lands the anchor off-screen (never dropped, never blocks).
function makeCtx(): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, 0],
    vp: mat4.create(),
    canvasSize: { width: 1000, height: 1000 },
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
  };
}
function makeLineStub() {
  return { setLines: vi.fn(), render: vi.fn(), lineCount: () => 0, destroy: vi.fn() };
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

    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);
    expect(labelStub.setLabels).toHaveBeenCalledWith([a, b]);
    expect(lineStub.setLines).toHaveBeenCalledTimes(1);
    // Lines without an ownerLabelId survive declutter unconditionally.
    expect(lineStub.setLines).toHaveBeenCalledWith([la, lb]);
  });

  it('skips re-uploading the same merged set across frames', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);
    dir.registerProducer(makeProducer('p', [SAMPLE_LABEL], [SAMPLE_LINE]));

    dir.runFrame(makeState(), makeCtx());
    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);
    expect(lineStub.setLines).toHaveBeenCalledTimes(1);
  });

  it('calls scheduler.requestRender when any producer is awake', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);
    dir.registerProducer(makeProducer('p', [], [], true));

    const requestRender = vi.fn();
    dir.runFrame(makeState(requestRender), makeCtx());
    expect(requestRender).toHaveBeenCalledTimes(1);
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

    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);
    expect(lineStub.setLines).toHaveBeenCalledTimes(1);

    alpha = 0.7;
    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledTimes(2);
    expect(lineStub.setLines).toHaveBeenCalledTimes(2);

    // Settling at the same fadeAlpha should NOT re-upload — the
    // signature optimization still skips identical frames.
    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledTimes(2);
    expect(lineStub.setLines).toHaveBeenCalledTimes(2);
  });

  it('flushes empty when no producers contribute, then skips subsequent empties', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    dir.runFrame(makeState(), makeCtx());
    dir.runFrame(makeState(), makeCtx());
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

    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledWith([big]);
    expect(lineStub.setLines).toHaveBeenCalledWith([bigLine]);
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

    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledWith([onScreen, offScreen]);
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

  it('treats a label with no prominencePx (you-are-here) as prominence 0', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    // you-are-here (no prominencePx) collides with a prominent structure label
    // at the same point → loses the overlap; its stem line drops with it.
    const youAreHere: Label = { ...SAMPLE_LABEL, id: 'you-are-here' };
    const yahLine: MarkerLine = {
      ...SAMPLE_LINE,
      id: 'you-are-here',
      ownerLabelId: 'you-are-here',
    };
    const structure: Label = { ...SAMPLE_LABEL, id: 'coma', prominencePx: 200 };
    dir.registerProducer(makeProducer('yah', [youAreHere], [yahLine]));
    dir.registerProducer(makeProducer('struct', [structure], []));

    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledWith([structure]);
    expect(lineStub.setLines).toHaveBeenCalledWith([]);
  });
});
