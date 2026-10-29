/**
 * Tagged — a nominal tag on a structural base, in type-fest's shape: the tag is
 * a phantom key, so a `Tagged<string, 'x'>` is still a plain string at runtime
 * (Redux, Maps and `JSON` see no wrapper). Tags stack by intersection:
 * `Tagged<string, 'a'> & Tagged<string, 'b'>` carries both and is assignable to
 * either, because each tag is its own property under the one phantom key.
 */

declare const tag: unique symbol;

export type Tagged<Base, Tag extends string> = Base & {
  readonly [tag]: { readonly [K in Tag]: void };
};
