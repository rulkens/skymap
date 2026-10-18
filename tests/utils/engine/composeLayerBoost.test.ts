import { describe, expect, it } from 'vitest';
import type { FrameBoost } from '../../../src/@types/engine/frame/FrameBoost';
import type { LayerInstance } from '../../../src/@types/engine/layer/LayerInstance';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import { composeLayerBoost } from '../../../src/utils/engine/composeLayerBoost';

const SETTINGS = {} as EngineSettingsState;

const BOOST: FrameBoost = {
  shipMpc: [1, 2, 3],
  dir: [0, 0, 1],
  beta: 0.5,
  gamma: 2 / Math.sqrt(3),
  contraction: true,
  doppler: true,
  headlight: 1,
};

function layer(boost?: LayerInstance['boost']): LayerInstance {
  return { name: 'stub', boost } as unknown as LayerInstance;
}

describe('composeLayerBoost', () => {
  it("composeLayerBoost returns the one answering Layer's boost", () => {
    let seen: [EngineSettingsState, number] | null = null;
    const answering = layer((settings, simDays) => {
      seen = [settings, simDays];
      return BOOST;
    });
    expect(composeLayerBoost([layer(), answering], SETTINGS, 2451545)).toBe(BOOST);
    expect(seen).toEqual([SETTINGS, 2451545]);
  });

  it('composeLayerBoost returns null when none answers', () => {
    expect(composeLayerBoost([layer(), layer()], SETTINGS, 0)).toBeNull();
  });

  it('composeLayerBoost ignores Layers whose boost returns null', () => {
    expect(composeLayerBoost([layer(() => null), layer(() => BOOST)], SETTINGS, 0)).toBe(BOOST);
  });
});
