import type { Slice } from '@reduxjs/toolkit';

import type { Layer } from '../../../@types/engine/layer/Layer';
import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { LayerInstance } from '../../../@types/engine/layer/LayerInstance';
import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

/**
 * Bind one Layer to its own `Runtime`, once — the only place `create` runs.
 * Every contribution hook is called here, so core's composers only ever touch
 * the returned lists and closures, never the Layer object again.
 */
export function instantiateLayer<
  Runtime,
  Settings extends readonly Slice[],
  Sources extends readonly (readonly [SourceType, SourceEntry])[],
  Facts,
>(
  layer: Layer<string, Runtime, Settings, Sources, Facts>,
  deps: LayerCoreDeps<Facts>,
): LayerInstance {
  const runtime = layer.create(deps);
  return {
    name: layer.name,
    passes: layer.passes(runtime),
    computes: layer.computes?.(runtime) ?? [],
    assets: layer.assets?.(runtime) ?? [],
    fades: layer.fades?.(runtime) ?? [],
    labels: layer.labels?.(runtime) ?? [],
    selection: layer.selection?.(runtime) ?? [],
    frame: layer.frame?.(runtime) ?? null,
    destroy: () => layer.destroy(runtime),
  };
}
