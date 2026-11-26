import type { CatalogLoadOutcome } from '../../../../../@types/catalog/import/CatalogLoadOutcome';

/** The dialog's one problem: a refused file, else a parse that came to a problem. */
export function loadProblem(
  refusal: string | null,
  outcome: CatalogLoadOutcome | null,
): Pick<Extract<CatalogLoadOutcome, { kind: 'problem' }>, 'message' | 'showExample'> | null {
  if (refusal !== null) return { message: refusal, showExample: false };
  return outcome?.kind === 'problem' ? outcome : null;
}
