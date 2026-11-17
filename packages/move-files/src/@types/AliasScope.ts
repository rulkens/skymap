import type { AliasRule } from './AliasRule';

/** The aliases of the nearest tsconfig, governing every importer under `dir`. */
export type AliasScope = { readonly dir: string; readonly rules: readonly AliasRule[] };
