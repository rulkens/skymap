import { describe, expect, it } from 'vitest';

import { APP_VISIBILITY } from '../../../../src/compositions/appVisibility';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
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
  it('multiplies fade and the clip, never recession', () => {
    const state = makeState({ localBubble: 0.5 }, { localBubble: 0.5 });
    expect(resolveVisibilityOpacity(state, { nowMs: 0 }, 'localBubble')).toBeCloseTo(0.25);
  });

  it("an of label carries its of entry's clip", () => {
    const state = makeState({ 'label:constellations': 0.8 }, { constellations: 0.5 });
    const value = resolveVisibilityOpacity(state, { nowMs: 0 }, 'label:constellations');
    expect(value).toBeCloseTo(0.8 * 0.5);
  });
});
