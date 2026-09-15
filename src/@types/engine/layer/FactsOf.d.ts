import type { Layer } from './Layer';

/**
 * `{ [name]: Facts }` over every Layer that declares facts — types `state.engine[name]`.
 * Type-only: `createLayers` seeds the initial values from `layer.facts` at runtime
 * (Finding, D1's module-init cycle), so nothing here folds a value.
 */
export type FactsOf<Layers extends readonly Layer<string, unknown>[]> = {
  [L in Layers[number] as L extends {
    readonly name: infer N extends string;
    readonly facts: object;
  }
    ? N
    : never]: L extends { readonly facts: infer F } ? F : never;
};
