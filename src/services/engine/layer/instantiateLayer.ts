import type { Layer } from '../../../@types/engine/layer/Layer';
import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { LayerInstance } from '../../../@types/engine/layer/LayerInstance';
import type { SettingsFragmentLike } from '../../../@types/settings/SettingsFragmentLike';
import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

/**
 * Bind one Layer to its own `Runtime`, once — the only place `create` runs.
 * Every contribution hook is called here, so core's composers only ever touch
 * the returned lists and closures, never the Layer object again. `onRuntime` is
 * the ONE exception, and it is temporary: `createLayers` parks the galaxy
 * runtime on `state.galaxyBridge` for the two shell reads 04e deletes
 * (Ruling 5). It is a parameter rather than a `LayerInstance` field so the
 * durable contract never grows a `runtime: unknown` hole.
 */
export function instantiateLayer<
  Runtime,
  Settings extends readonly SettingsFragmentLike[],
  Sources extends readonly (readonly [SourceType, SourceEntry])[],
  Facts,
>(
  layer: Layer<string, Runtime, Settings, Sources, Facts>,
  deps: LayerCoreDeps<Facts>,
  onRuntime?: (runtime: Runtime) => void,
): LayerInstance {
  const runtime = layer.create(deps);
  onRuntime?.(runtime);
  return {
    name: layer.name,
    passes: layer.passes(runtime),
    assets: layer.assets?.(runtime) ?? [],
    fades: layer.fades?.(runtime) ?? [],
    labels: layer.labels?.(runtime) ?? [],
    selection: layer.selection?.(runtime) ?? [],
    frame: layer.frame?.(runtime) ?? null,
    destroy: () => layer.destroy(runtime),
  };
}
