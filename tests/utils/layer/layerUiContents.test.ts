import { describe, expect, it } from 'vitest';
import { layerUiContents } from '../../../src/utils/layer/layerUiContents';
import type { Layer } from '../../../src/@types/engine/layer/Layer';

function stubLayer(
  name: string,
  ui: readonly { slot: string; content: string }[],
): Layer<string, unknown> {
  return { name, ui } as unknown as Layer<string, unknown>;
}

describe('layerUiContents', () => {
  it('keeps only the asked slot, in layer then entry order', () => {
    const layers = [
      stubLayer('a', [
        { slot: 'main', content: 'a-main-1' },
        { slot: 'debug', content: 'a-debug' },
        { slot: 'main', content: 'a-main-2' },
      ]),
      stubLayer('b', [
        { slot: 'labelsAndGuides', content: 'b-row' },
        { slot: 'main', content: 'b-main' },
        { slot: 'detailCard', content: 'b-detail-card' },
      ]),
    ] as unknown as readonly Layer<string, unknown>[];

    expect(layerUiContents(layers, 'main')).toEqual(['a-main-1', 'a-main-2', 'b-main']);
    expect(layerUiContents(layers, 'debug')).toEqual(['a-debug']);
    expect(layerUiContents(layers, 'labelsAndGuides')).toEqual(['b-row']);
    expect(layerUiContents(layers, 'detailCard')).toEqual(['b-detail-card']);
  });

  it('returns an empty list when no Layer declares ui', () => {
    const layers = [{ name: 'a' } as unknown as Layer<string, unknown>];
    expect(layerUiContents(layers, 'main')).toEqual([]);
  });
});
