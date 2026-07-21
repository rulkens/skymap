/**
 * parseSymbolAddress — split a `file#symbol` address string into its two parts.
 *
 * ## Why a `file#symbol` grammar
 *
 * Every refactor subcommand (move a symbol, rename it, inline it) names its
 * target the same way: which file, which exported identifier. Rather than pass
 * two positional CLI args and re-validate the pairing at each command, we adopt
 * one textual address — `src/utils/math/clamp.ts#clamp` — that reads like the
 * jump-to-symbol syntax editors already use. The `#` is the delimiter because
 * it can't appear in a POSIX path or a TS identifier, so a single `split` on the
 * FIRST `#` is unambiguous (a stray `#` later in the string can't happen in
 * either half, but splitting on the first keeps the file half verbatim regardless).
 *
 * ## Why parsing throws instead of returning a null shape
 *
 * This is the address layer every mutation runs through first, and the whole
 * point of the layer is to fail loudly BEFORE any AST is touched. A malformed
 * address (no `#`, an empty path, an empty symbol) is operator error that can
 * only produce a nonsensical mutation downstream, so we reject it here with a
 * message that shows the offending input rather than handing back a half-empty
 * struct a caller might forget to check.
 *
 * The `SymbolAddress` type is co-located with its only parser (the `applyMoves.ts`
 * → `MovePair` pattern: a small type exported next to the one function that
 * produces it), not spun into a separate `@types`-style file — this is `tools/`,
 * and the shape only means anything paired with the parse.
 */

export type SymbolAddress = {
  readonly file: string; // path as given (relative or absolute)
  readonly symbol: string; // exported identifier
};

export function parseSymbolAddress(address: string): SymbolAddress {
  const hashIndex = address.indexOf('#');
  if (hashIndex === -1) {
    throw new Error(
      `Invalid symbol address '${address}': expected 'file#symbol' (missing '#' delimiter).`,
    );
  }

  const file = address.slice(0, hashIndex);
  const symbol = address.slice(hashIndex + 1);

  if (file === '') {
    throw new Error(`Invalid symbol address '${address}': the file part is empty.`);
  }
  if (symbol === '') {
    throw new Error(`Invalid symbol address '${address}': the symbol part is empty.`);
  }

  return { file, symbol };
}
