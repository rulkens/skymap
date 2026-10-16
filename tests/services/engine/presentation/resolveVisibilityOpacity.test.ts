import { describe, expect, it } from 'vitest';

import { APP_VISIBILITY } from '../../../../src/compositions/appVisibility';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import {
  MILD_RECESSION,
  STRONG_RECESSION,
} from '../../../../src/services/engine/presentation/focusRecession';
import { resolveVisibilityOpacity } from '../../../../src/services/engine/presentation/resolveVisibilityOpacity';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeState(fade: Record<string, number>, clip: Record<string, number>) {
  const fades = createFadeRegistry({ requestRender: () => {} });
  for (const [address, value] of Object.entries(fade)) {
    fades.register({ address } as never, value);
  }
  const clipPlayer = { clipOpacityOf: (address: string) => clip[address] ?? 1 };
  return {
    subsystems: { fades, clipPlayer },
    visibilityEntries: APP_VISIBILITY,
  } as unknown as Pick<EngineState, 'subsystems' | 'visibilityEntries'>;
}

describe('resolveVisibilityOpacity', () => {
  it('multiplies fade, the entry recession and the clip', () => {
    const state = makeState({ localBubble: 0.5 }, { localBubble: 0.5 });
    const value = resolveVisibilityOpacity(state, { nowMs: 0, focusBlend: 1 }, 'localBubble');
    expect(value).toBeCloseTo(0.5 * STRONG_RECESSION * 0.5);
  });

  it('a mild entry recedes to MILD_RECESSION at full focus', () => {
    const state = makeState({}, {});
    state.subsystems.fades.register({ address: 'label:blackHole', item: 'sgr-a-star' }, 1);
    const value = resolveVisibilityOpacity(
      state,
      { nowMs: 0, focusBlend: 1 },
      'label:blackHole',
      'sgr-a-star',
    );
    expect(value).toBeCloseTo(MILD_RECESSION);
  });

  it('a non-receding entry ignores the focus blend', () => {
    const state = makeState({ flow: 0.5 }, {});
    expect(resolveVisibilityOpacity(state, { nowMs: 0, focusBlend: 1 }, 'flow')).toBeCloseTo(0.5);
  });

  it("an of label carries its of entry's clip", () => {
    const state = makeState({ 'label:constellations': 0.8 }, { constellations: 0.5 });
    const value = resolveVisibilityOpacity(
      state,
      { nowMs: 0, focusBlend: 1 },
      'label:constellations',
    );
    expect(value).toBeCloseTo(0.8 * STRONG_RECESSION * 0.5);
  });
});
