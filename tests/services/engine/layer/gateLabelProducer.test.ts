/**
 * The producer skip reads liveness (held target 1, or the RAW fade above 0), never the
 * handed value: a clip at 0 on a label switched off mid-fade must not cut its fade-out tail.
 */

import { describe, expect, it, vi } from 'vitest';

import { APP_VISIBILITY } from '../../../../src/compositions/appVisibility';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { gateLabelProducer } from '../../../../src/services/engine/layer/gateLabelProducer';
import type { FadeIdentity } from '../../../../src/@types/animation/FadeIdentity';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { VisibilityEntry } from '../../../../src/@types/engine/layer/VisibilityEntry';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Label2DProducerOutput } from '../../../../src/@types/engine/subsystems/Label2DProducerOutput';

const OUTPUT: Label2DProducerOutput = { labels: [], awake: true };
const MID_FADE_MS = 300;

function makeState(clip = 1, entries: readonly VisibilityEntry[] = APP_VISIBILITY) {
  const fades = createFadeRegistry({ requestRender: () => {} });
  const clipPlayer = { clipOpacityOf: () => clip };
  const state = {
    subsystems: { fades, clipPlayer },
    visibilityEntries: entries,
  } as unknown as EngineState;
  return { state, fades };
}

const ctxAt = (nowMs: number) =>
  ({ drawCamPos: [0.5, 0, 0], snapshot: { nowMs, focusBlend: 0 } }) as unknown as FrameView;

function milkyWayRow() {
  const produceLabels = vi.fn((_s: EngineState, _c: FrameView, _fade?: unknown) => OUTPUT);
  return { row: { id: 'mw', label: 'milkyWay' as const, produceLabels }, produceLabels };
}

// Switched off at t=0, so the raw fade is still falling at `MID_FADE_MS`.
function fadingOut(fades: ReturnType<typeof createFadeRegistry>, id: FadeIdentity): void {
  fades.register(id, 1);
  fades.fadeTo(id, 0, 1000, 0);
}

describe('gateLabelProducer', () => {
  it('off and faded out → not called', () => {
    const { state, fades } = makeState();
    fades.register({ address: 'label:milkyWay' }, 0);
    const { row, produceLabels } = milkyWayRow();
    expect(gateLabelProducer(row).produceLabels(state, ctxAt(0))).toEqual({
      labels: [],
      awake: false,
    });
    expect(produceLabels).not.toHaveBeenCalled();
  });

  it('off and still fading → called with the falling value', () => {
    const { state, fades } = makeState();
    fadingOut(fades, { address: 'label:milkyWay' });
    const { row, produceLabels } = milkyWayRow();
    gateLabelProducer(row).produceLabels(state, ctxAt(MID_FADE_MS));
    const raw = fades.opacityOf({ address: 'label:milkyWay' }, MID_FADE_MS);
    expect(raw).toBeGreaterThan(0);
    expect(raw).toBeLessThan(1);
    expect(produceLabels).toHaveBeenCalledWith(state, expect.anything(), raw);
  });

  it('on → called', () => {
    const { state, fades } = makeState();
    fades.register({ address: 'label:milkyWay' }, 1);
    const { row, produceLabels } = milkyWayRow();
    gateLabelProducer(row).produceLabels(state, ctxAt(0));
    expect(produceLabels).toHaveBeenCalledWith(state, expect.anything(), 1);
  });

  it('off with raw fade > 0 and clip 0 → still called', () => {
    const { state, fades } = makeState(0);
    fadingOut(fades, { address: 'label:milkyWay' });
    const { row, produceLabels } = milkyWayRow();
    gateLabelProducer(row).produceLabels(state, ctxAt(MID_FADE_MS));
    expect(produceLabels).toHaveBeenCalledWith(state, expect.anything(), 0);
  });

  it('band 0 for every item skips a live producer', () => {
    const banded = APP_VISIBILITY.map((e) =>
      'label' in e && e.label === 'milkyWay' ? { ...e, bands: { near: { out: [0, 0.4] } } } : e,
    ) as readonly VisibilityEntry[];
    const { state, fades } = makeState(1, banded);
    fades.register({ address: 'label:milkyWay' }, 1);
    const { row, produceLabels } = milkyWayRow();
    gateLabelProducer(row).produceLabels(state, ctxAt(0));
    expect(produceLabels).not.toHaveBeenCalled();
  });

  it('the only live item sits at band 0 while a dead item has band > 0 → skipped', () => {
    const banded = APP_VISIBILITY.map((e) =>
      'label' in e && e.label === 'structure'
        ? { ...e, bands: { near: { out: [0, 0.4], items: ['void'] } } }
        : e,
    ) as readonly VisibilityEntry[];
    const { state, fades } = makeState(1, banded);
    for (const item of STRUCTURE_IDS) fades.register({ address: 'label:structure', item }, 0);
    fades.setImmediate({ address: 'label:structure', item: 'void' }, 1);
    const produceLabels = vi.fn((_s: EngineState, _c: FrameView, _fade?: unknown) => OUTPUT);
    gateLabelProducer({ id: 's', label: 'structure', produceLabels }).produceLabels(
      state,
      ctxAt(0),
    );
    expect(produceLabels).not.toHaveBeenCalled();
  });

  it('a per-item row is skipped only when no item is live', () => {
    const { state, fades } = makeState();
    for (const item of STRUCTURE_IDS) fades.register({ address: 'label:structure', item }, 0);
    const produceLabels = vi.fn((_s: EngineState, _c: FrameView, _fade?: unknown) => OUTPUT);
    const gated = gateLabelProducer({ id: 's', label: 'structure', produceLabels });
    gated.produceLabels(state, ctxAt(0));
    expect(produceLabels).not.toHaveBeenCalled();

    fades.setImmediate({ address: 'label:structure', item: 'void' }, 1);
    gated.produceLabels(state, ctxAt(0));
    expect(produceLabels).toHaveBeenCalledWith(
      state,
      expect.anything(),
      expect.objectContaining({ void: 1, supercluster: 0 }),
    );
  });

  // The directors recede a producer's labels by this entry; a gate that dropped it would leave
  // every label at full emphasis with no other test failing.
  it("the gated producer keeps its row's label", () => {
    expect(gateLabelProducer(milkyWayRow().row).label).toBe('milkyWay');
  });
});
