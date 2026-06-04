/**
 * registry.test — the visualization registry's contract.
 *
 * The registry is a module-level singleton, so these tests deliberately use a
 * UNIQUE id per case (cosmic-flow:test:<case>) to avoid cross-test bleed: a
 * stale entry from one case must not be visible to another. We assert the three
 * behaviours the engine depends on — registration is observable via
 * `listFactories`, a duplicate id is last-wins (not a throw, not a second
 * entry), and each factory call yields an independent instance.
 */
import { describe, expect, it } from 'vitest';
import { register, listFactories } from '../../../../tools/cosmic-flow/src/visualizations/registry';
import type { Visualization } from '../../../../tools/cosmic-flow/@types/visualizations/Visualization';

const fakeViz = (id: string): Visualization =>
  ({
    id,
    label: 'x',
    paramSpecs: [],
    init() {},
    encode() {},
    dispose() {},
  }) as Visualization;

describe('visualization registry', () => {
  it('register then listFactories returns the registered id', () => {
    const id = 'cosmic-flow:test:basic';
    register(id, () => fakeViz(id));
    expect(listFactories().some((e) => e.id === id)).toBe(true);
  });

  it('register is last-wins for a duplicate id', () => {
    const id = 'cosmic-flow:test:dup';
    const first: () => Visualization = () => fakeViz(id);
    const second: () => Visualization = () => fakeViz(id);
    register(id, first);
    register(id, second);

    const entries = listFactories().filter((e) => e.id === id);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.factory).toBe(second);
  });

  it('listFactories returns factories that produce independent instances', () => {
    const id = 'cosmic-flow:test:independent';
    register(id, () => fakeViz(id));

    const entry = listFactories().find((e) => e.id === id);
    expect(entry).toBeDefined();
    const a = entry!.factory();
    const b = entry!.factory();
    expect(a).not.toBe(b);
  });
});
