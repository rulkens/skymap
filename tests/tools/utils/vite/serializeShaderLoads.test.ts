import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import { serializeShaderLoads } from '../../../../tools/utils/vite/serializeShaderLoads';

/** A load hook that records how many calls overlap, resolving each after a tick. */
function trackingPlugin() {
  const state = { active: 0, peak: 0 };
  const plugin: Plugin = {
    name: 'tracking',
    async load(id) {
      state.active++;
      state.peak = Math.max(state.peak, state.active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      state.active--;
      return `loaded ${id}`;
    },
  };
  return { plugin, state };
}

const callLoad = (plugin: Plugin, id: string) =>
  (plugin.load as (this: unknown, id: string) => Promise<unknown>).call({}, id);

describe('serializeShaderLoads', () => {
  it('runs shader loads one at a time, in order, with their results', async () => {
    const { plugin, state } = trackingPlugin();
    const wrapped = serializeShaderLoads(plugin);
    const ids = ['a.wesl?static', 'b.wesl?static', 'c.wgsl'];
    expect(await Promise.all(ids.map((id) => callLoad(wrapped, id)))).toEqual(
      ids.map((id) => `loaded ${id}`),
    );
    expect(state.peak).toBe(1);
  });

  it('lets other modules load concurrently', async () => {
    const { plugin, state } = trackingPlugin();
    const wrapped = serializeShaderLoads(plugin);
    await Promise.all(['a.ts', 'b.tsx', 'c.css'].map((id) => callLoad(wrapped, id)));
    expect(state.peak).toBe(3);
  });

  it('keeps the queue moving after a load throws', async () => {
    const wrapped = serializeShaderLoads({
      name: 'flaky',
      load: (id) => (id.startsWith('bad') ? Promise.reject(new Error('boom')) : `ok ${id}`),
    });
    await expect(callLoad(wrapped, 'bad.wesl')).rejects.toThrow('boom');
    expect(await callLoad(wrapped, 'good.wesl')).toBe('ok good.wesl');
  });
});
