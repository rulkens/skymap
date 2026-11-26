import { useEffect, useRef, type RefObject } from 'react';
import type { CatalogFiles } from '../../../../@types/catalog/import/CatalogFiles';
import type { CatalogParse } from '../../../../@types/catalog/import/CatalogParse';

/**
 * useFocusOnFirstParse — focus moves to `target` (Load) when a file's first parse
 * succeeds; a re-parse leaves it where the user is.
 */
export function useFocusOnFirstParse(
  parsed: CatalogParse | null,
  target: RefObject<HTMLElement | null>,
): void {
  const focusedFor = useRef<CatalogFiles | null>(null);
  useEffect(() => {
    if (!parsed || focusedFor.current === parsed.files) return;
    focusedFor.current = parsed.files;
    if (parsed.preview.outcome.kind !== 'problem') target.current?.focus();
  }, [parsed, target]);
}
