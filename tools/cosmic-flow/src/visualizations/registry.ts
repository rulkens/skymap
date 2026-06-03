/**
 * registry — the module-level catalogue of available visualization layers.
 *
 * This is the open end of the Strategy pattern (see `Visualization`): a layer
 * module calls `register(id, factory)` at import time, and the engine later
 * enumerates `listFactories()` to build its layer set. The engine itself never
 * names a concrete layer, so adding one is a closed operation — implement
 * `Visualization`, `register()` it, done.
 *
 * We store FACTORIES, not instances: enumeration is cheap (no GPU resources are
 * touched), and the engine constructs a layer only when it decides to. Backing
 * store is a `Map`, which preserves insertion order — `listFactories()` returns
 * entries in registration order, and a duplicate id is last-wins (the later
 * `register` overwrites in place, keeping the original slot). Last-wins (rather
 * than throw) lets a dev hot-swap a layer's factory during iteration without a
 * crash.
 *
 * The state is a module-level singleton. Tests that exercise it must use
 * distinct ids per case to avoid cross-test bleed.
 */
import type { VisualizationFactory } from '../../@types/visualizations/VisualizationFactory';

const factories = new Map<string, VisualizationFactory>();

export function register(id: string, factory: VisualizationFactory): void {
  // Map.set is last-wins and keeps the original insertion slot for an existing
  // key, so re-registering an id replaces its factory without reordering.
  factories.set(id, factory);
}

export function listFactories(): readonly {
  readonly id: string;
  readonly factory: VisualizationFactory;
}[] {
  return Array.from(factories, ([id, factory]) => ({ id, factory }));
}
