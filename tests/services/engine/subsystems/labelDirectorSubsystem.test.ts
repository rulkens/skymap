import { describe, expect, it, vi } from 'vitest';
import { createLabelDirectorSubsystem } from '../../../../src/services/engine/subsystems/labelDirectorSubsystem';
import type { LabelProducer } from '../../../../src/services/engine/subsystems/labelProducer';
import type { Label } from '../../../../src/@types/rendering/Label';
import type { MarkerLine } from '../../../../src/@types/rendering/MarkerLine';
import type { ReadyFrameContext } from '../../../../src/services/engine/frame/frameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeState(requestRender: () => void = () => {}): EngineState {
  return { subsystems: { scheduler: { requestRender } } } as unknown as EngineState;
}

function makeCtx(): ReadyFrameContext {
  return { drawCamPos: [0, 0, 0] } as unknown as ReadyFrameContext;
}

function makeProducer(id: string, labels: Label[], lines: MarkerLine[], awake = false): LabelProducer {
  return { id, produceLabels: () => ({ labels, lines, awake }) };
}

function makeLabelStub() {
  return { setLabels: vi.fn(), render: vi.fn(), glyphCount: () => 0, labelCount: () => 0, destroy: vi.fn() };
}
function makeLineStub() {
  return { setLines: vi.fn(), render: vi.fn(), lineCount: () => 0, destroy: vi.fn() };
}

const SAMPLE_LABEL: Label = {
  id: 'sample-label',
  worldPos: [0, 0, 0],
  text: 'x',
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

    const a: Label = { ...SAMPLE_LABEL, id: 'a' };
    const b: Label = { ...SAMPLE_LABEL, id: 'b' };
    const la: MarkerLine = { ...SAMPLE_LINE, id: 'la' };
    const lb: MarkerLine = { ...SAMPLE_LINE, id: 'lb' };
    dir.registerProducer(makeProducer('pa', [a], [la]));
    dir.registerProducer(makeProducer('pb', [b], [lb]));

    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);
    expect(labelStub.setLabels).toHaveBeenCalledWith([a, b]);
    expect(lineStub.setLines).toHaveBeenCalledTimes(1);
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
});
