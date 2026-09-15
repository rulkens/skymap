import { describe, it, expect, vi } from 'vitest';
import { instantiateLayer } from '../../../../src/services/engine/layer/instantiateLayer';
import type { Layer } from '../../../../src/@types/engine/layer/Layer';
import type { LayerCoreDeps } from '../../../../src/@types/engine/layer/LayerCoreDeps';

const STUB_DEPS = {} as LayerCoreDeps<undefined>;

describe('instantiateLayer', () => {
  it('binds frame and selection to the runtime create returned', () => {
    const runtime = { tag: 'stub-runtime' };
    const frameSpy = vi.fn(() => true);
    const layer: Layer<'stub', typeof runtime> = {
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
    expect(instance.frame?.(ctx, passState)).toBe(true);
    expect(frameSpy).toHaveBeenCalledWith(ctx, passState);
  });

  it('a Layer without frame or selection binds null and []', () => {
    const runtime = { tag: 'bare' };
    const layer: Layer<'bare', typeof runtime> = {
      name: 'bare',
      create: () => runtime,
      destroy: vi.fn(),
      passes: () => [],
    };

    const instance = instantiateLayer(layer, STUB_DEPS);

    expect(instance.frame).toBeNull();
    expect(instance.selection).toEqual([]);
  });

  it('destroy calls the Layer destroy with the created runtime', () => {
    const runtime = { tag: 'destroy-me' };
    const destroySpy = vi.fn();
    const layer: Layer<'d', typeof runtime> = {
      name: 'd',
      create: () => runtime,
      destroy: destroySpy,
      passes: () => [],
    };

    const instance = instantiateLayer(layer, STUB_DEPS);
    instance.destroy();

    expect(destroySpy).toHaveBeenCalledWith(runtime);
  });
});
