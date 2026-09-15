/**
 * Identity at runtime; it exists so a Layer literal infers its own `Runtime` (and its
 * `const`-inferred `Settings`/`Sources`/`Facts` literals) from `create`'s return and the
 * object's own shape, while still being checked against `Layer`.
 */

import type { Layer } from '../../../@types/engine/layer/Layer';
import type { SettingsFragmentLike } from '../../../@types/settings/SettingsFragmentLike';
import type { SourceType } from '../../../@types/data/SourceType';
import type { SourceEntry } from '../../../@types/data/SourceEntry';

export function defineLayer<
  const Name extends string,
  Runtime,
  const Settings extends readonly SettingsFragmentLike[] = readonly [],
  const Sources extends readonly (readonly [SourceType, SourceEntry])[] = readonly [],
  const Facts = undefined,
>(
  layer: Layer<Name, Runtime, Settings, Sources, Facts>,
): Layer<Name, Runtime, Settings, Sources, Facts> {
  return layer;
}
