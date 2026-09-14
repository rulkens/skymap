import type { Tier } from '../../@types/data/Tier';

/**
 * A galaxy catalog ships per-tier `.bin` variants iff it carries any per-tier cap.
 * ONE site: `tierFilenameForSource` picks `<base>-<tier>.bin` vs `<base>.bin` with it and
 * `galaxyCatalogRequest` decides whether the request names a tier with it, so a request
 * and the file it names cannot disagree.
 */
export function shipsTierVariants(tierTargets: Partial<Record<Tier, number>>): boolean {
  // Key COUNT, not value truthiness: an exclusion cap (`small: 0`) still has a variant.
  return Object.keys(tierTargets).length > 0;
}
