import type { Layer } from './Layer';
import type { SettingsFragmentLike } from '../../settings/SettingsFragmentLike';

/**
 * Every settings fragment declared across `Layers`, as a union-typed array — never a
 * tuple walk, because `ComposedClusters` only ever reads `Fragments[number]`.
 */
export type SettingsOf<Layers extends readonly Layer<string, unknown>[]> =
  readonly (Layers[number] extends infer L
    ? L extends { readonly settings: readonly (infer F extends SettingsFragmentLike)[] }
      ? F
      : never
    : never)[];
