import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mat4 } from 'gl-matrix';
import { createLabelDirectorSubsystem } from '../../../../src/services/engine/subsystems/labelDirectorSubsystem';
import {
  clearLabelStyleOverride,
  setLabelStyleOverride,
} from '../../../../src/services/engine/labelStyleOverride';
import type { LabelProducer } from '../../../../src/@types/engine/subsystems/LabelProducer';
import type { Label } from '../../../../src/@types/rendering/Label';
import type { MarkerLine } from '../../../../src/@types/rendering/MarkerLine';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeState(requestRender: () => void = () => {}): EngineState {
  // The director fires a one-shot 'poi' layer fade on the first non-empty
  // flush, so the stub state needs a `fades.fadeTo`.
  return {
    subsystems: { scheduler: { requestRender }, fades: { fadeTo: vi.fn() } },
  } as unknown as EngineState;
}

function makeCtx(): ReadyFrameContext {
  // identity vp + a canvas so the director's declutter projection has the
  // fields it reads; the single sample label projects on-screen and survives.
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

describe('labelDirectorSubsystem — labelStyleOverride wake', () => {
  // The override is process-wide module-scoped state; reset before each
  // test so prior tests' mutations don't leak in.
  beforeEach(() => {
    clearLabelStyleOverride();
  });

  it('re-flushes when the override changes even if merged labels are id+fadeAlpha-stable', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);
    // A constant producer — same single label + line, frame after frame.
    // Without the override-version term in the signature, frames 2+ would
    // short-circuit and skip the GPU upload.
    dir.registerProducer(makeProducer('p', [SAMPLE_LABEL], [SAMPLE_LINE]));

    dir.runFrame(makeState(), makeCtx());
    dir.runFrame(makeState(), makeCtx());
    // Sanity: the dedupe path is intact for the stable producer.
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);
    expect(lineStub.setLines).toHaveBeenCalledTimes(1);

    // Edit the override.  The producer's output is unchanged, but the
    // director's signature must include the override version so the
    // next frame re-flushes (so a DebugPanel slider edit takes effect
    // immediately rather than waiting for some other invalidator).
    setLabelStyleOverride({
      targetCategory: 'youAreHere',
      outlineColor: [0, 0, 0, 1],
      outlineEmFrac: 0.1,
    });

    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledTimes(2);
    expect(lineStub.setLines).toHaveBeenCalledTimes(2);
  });

  it('re-flushes on clearLabelStyleOverride as well (both setter and clearer bump the version)', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);
    dir.registerProducer(makeProducer('p', [SAMPLE_LABEL], [SAMPLE_LINE]));

    // Prime with an override active so we start at version > 0.
    setLabelStyleOverride({
      targetCategory: 'youAreHere',
      outlineColor: [0, 0, 0, 1],
      outlineEmFrac: 0.1,
    });
    dir.runFrame(makeState(), makeCtx());
    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);

    clearLabelStyleOverride();
    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledTimes(2);
  });
});
