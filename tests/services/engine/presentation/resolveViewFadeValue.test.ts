import { describe, expect, it, vi } from 'vitest';

import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { resolveViewFadeValue } from '../../../../src/services/engine/presentation/resolveViewFadeValue';
import { smoothstep } from '../../../../src/utils/math/smoothstep';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { VisibilityEntry } from '../../../../src/@types/engine/layer/VisibilityEntry';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

const OUT = 1 - smoothstep(0, 2, 1);

const THING: VisibilityEntry = {
  key: 'thing',
  items: ['a', 'b'],
  bands: { near: { out: [0, 2], items: ['a'] } },
};
const THING_LABEL: VisibilityEntry = {
  label: 'thing',
  cluster: 'thing',
  of: 'thing',
  items: ['a', 'b'],
};

function makeState(fade: number, clip: number) {
  const fades = createFadeRegistry({ requestRender: () => {} });
  for (const item of ['a', 'b']) {
    fades.register({ address: 'thing', item } as never, fade);
    fades.register({ address: 'label:thing', item } as never, fade);
  }
  const state = {
    subsystems: { fades, clipPlayer: { clipOpacityOf: () => clip } },
    visibilityEntries: [THING, THING_LABEL],
  } as unknown as Pick<EngineState, 'subsystems' | 'visibilityEntries'>;
  return { state, fades };
}

// A fresh view per call site: the memo is keyed on view identity.
const viewAt = (d: number) =>
  ({
    drawCamPos: [d, 0, 0],
    snapshot: { nowMs: 0, bodyStates: new Map() },
  }) as unknown as FrameView;

describe('resolveViewFadeValue', () => {
  it('per-view value is fade × clip × band', () => {
    const { state } = makeState(0.5, 0.5);
    const value = resolveViewFadeValue(state, viewAt(1), 'thing' as never) as Record<
      string,
      number
    >;
    expect(value.a).toBeCloseTo(0.25 * OUT);
    expect(value.b).toBeCloseTo(0.25);
  });

  it("a label with of multiplies its show entry's band for the same item", () => {
    const { state } = makeState(1, 1);
    const value = resolveViewFadeValue(state, viewAt(1), 'label:thing' as never) as Record<
      string,
      number
    >;
    expect(value.a).toBeCloseTo(OUT);
    expect(value.b).toBe(1);
  });

  it('memoised per view', () => {
    const { state, fades } = makeState(1, 1);
    const opacityOf = vi.spyOn(fades, 'opacityOf');
    const view = viewAt(1);
    const first = resolveViewFadeValue(state, view, 'thing' as never);
    const reads = opacityOf.mock.calls.length;
    expect(resolveViewFadeValue(state, view, 'thing' as never)).toBe(first);
    expect(opacityOf.mock.calls.length).toBe(reads);
  });
});
