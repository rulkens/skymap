import { describe, it, expect, vi } from 'vitest';
import { instantiateLayer } from '../../../../src/services/engine/layer/instantiateLayer';
import type { Layer } from '../../../../src/@types/engine/layer/Layer';
import type { LayerCoreDeps } from '../../../../src/@types/engine/layer/LayerCoreDeps';

const STUB_DEPS = {} as LayerCoreDeps<undefined>;

describe('instantiateLayer', () => {
  it('binds frame and selection to the runtime create returned', () => {
    const runtime = { tag: 'stub-runtime' };
    const frameSpy = vi.fn(() => ({ awake: true, settling: false }));
    const layer: Layer<'stub', typeof runtime, readonly [], readonly [], undefined> = {
      name: 'stub',
      create: () => runtime,
      destroy: vi.fn(),
      passes: () => [],
      selection: () => [{ type: 'milkyWay' } as never],
      frame: (r) => {
        expect(r).toBe(runtime);
        return frameSpy;
      },
    };

    const instance = instantiateLayer(layer, STUB_DEPS);

    expect(instance.name).toBe('stub');
    expect(instance.selection).toHaveLength(1);
    const ctx = {} as never;
    const passState = {} as never;
    expect(instance.frame?.([ctx], passState)).toEqual({ awake: true, settling: false });
    expect(frameSpy).toHaveBeenCalledWith([ctx], passState);
  });
});
