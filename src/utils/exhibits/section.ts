import type { ExhibitSection } from '../../@types/exhibits/ExhibitSection';
import type { ExhibitSectionKind } from '../../@types/exhibits/ExhibitSectionKind';

/** An exhibit notes section: the one place a kind and its data are checked against each other. */
export function section<D>(kind: ExhibitSectionKind<D>, data: D): ExhibitSection {
  return { kind, data };
}
