import type { Layer } from './Layer';
import type { SourceType } from '../../data/SourceType';
import type { SourceEntry } from '../../data/SourceEntry';

/**
 * Every Layer's `SOURCE_REGISTRY` rows, composed into one record keyed by source code.
 * Type only — `composeSources(layers)` is D11's runtime fold and lands with PR-C's
 * source-row move (Ruling 8); nothing here has a consumer yet.
 */
export type ComposedSources<Layers extends readonly Layer<string, unknown>[]> = {
  [E in Layers[number] extends { readonly sources: readonly (infer E)[] }
    ? E
    : never as E extends readonly [infer C extends SourceType, SourceEntry]
    ? C
    : never]: E extends readonly [SourceType, infer S] ? S : never;
};
