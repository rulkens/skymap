import SourcesSection from './SourcesSection';
import type { ExhibitSourcesSection } from '../../../@types/exhibits/ExhibitSourcesSection';
import type { ExhibitSectionKind } from '../../../@types/exhibits/ExhibitSectionKind';

export const sourcesKind: ExhibitSectionKind<ExhibitSourcesSection> = {
  Component: SourcesSection,
};
