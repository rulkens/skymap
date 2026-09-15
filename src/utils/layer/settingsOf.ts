import type { Layer } from '../../@types/engine/layer/Layer';
import type { SettingsOf } from '../../@types/engine/layer/SettingsOf';

/** Flattens every Layer's `settings` fragments into one array, composition order preserved. */
export function settingsOf<const Layers extends readonly Layer<string, unknown>[]>(
  layers: Layers,
): SettingsOf<Layers> {
  return layers.flatMap((layer) => layer.settings ?? []) as unknown as SettingsOf<Layers>;
}
