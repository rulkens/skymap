import type { Layer } from './Layer';

/** A Layer's declared facts with the optionality stripped; `never` when it declares none. */
type FactsValue<L> = NonNullable<L extends { readonly facts?: infer F } ? F : never>;

/**
 * `{ [name]: Facts }` over every Layer that declares facts — types `state.engine[name]`.
 * Type-only: `createLayers` seeds the initial values from `layer.facts` at runtime
 * (Finding, D1's module-init cycle), so nothing here folds a value.
 */
export type FactsOf<Layers extends readonly Layer<string, unknown>[]> = {
  [L in Layers[number] as [FactsValue<L>] extends [never]
    ? never
    : L extends { readonly name: infer N extends string }
      ? N
      : never]: FactsValue<L>;
};
