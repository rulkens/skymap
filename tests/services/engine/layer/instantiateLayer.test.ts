import { describe, it, expect, vi } from 'vitest';
import { instantiateLayer } from '../../../../src/services/engine/layer/instantiateLayer';
import type { Layer } from '../../../../src/@types/engine/layer/Layer';
import type { LayerCoreDeps } from '../../../../src/@types/engine/layer/LayerCoreDeps';

const STUB_DEPS = {} as LayerCoreDeps<undefined>;

describe('instantiateLayer', () => {
  it('binds planners and selection to the runtime create returned', () => {
    const runtime = { tag: 'stub-runtime' };
    const plannerSpy = vi.fn(() => ({ value: undefined, awake: true, settling: false }));
    const layer: Layer<'stub', typeof runtime, readonly [], readonly [], undefined> = {
      name: 'stub',
      create: () => runtime,
      destroy: vi.fn(),
      passes: () => [],
      selection: () => [{ type: 'milkyWay' } as never],
      planners: (r) => {
        expect(r).toBe(runtime);
        return [{ name: 'stub-planner', scope: 'once', plan: plannerSpy }];
      },
    };

    const instance = instantiateLayer(layer, STUB_DEPS);

    expect(instance.name).toBe('stub');
    expect(instance.selection).toHaveLength(1);
    expect(instance.planners).toHaveLength(1);
    const snapshot = {} as never;
    const views = [] as never;
    const passState = {} as never;
    const planner = instance.planners[0]!;
    // Narrowed to the `once` arm: calling the unnarrowed union widens each
    // parameter position to the INTERSECTION of both arms, which no value satisfies.
    if (planner.scope !== 'once') throw new Error('expected a once-scope planner');
    expect(planner.plan(snapshot, views, passState)).toEqual({
      value: undefined,
      awake: true,
      settling: false,
    });
    expect(plannerSpy).toHaveBeenCalledWith(snapshot, views, passState);
  });
});
