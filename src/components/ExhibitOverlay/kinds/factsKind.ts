import FactsSection from './FactsSection';
import type { ExhibitFactsSection } from '../../../@types/exhibits/ExhibitFactsSection';
import type { ExhibitSectionKind } from '../../../@types/exhibits/ExhibitSectionKind';

export const factsKind: ExhibitSectionKind<ExhibitFactsSection> = {
  id: 'facts',
  Component: FactsSection,
};
