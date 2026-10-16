import ProseSection from './ProseSection';
import type { ExhibitProseSection } from '../../../@types/exhibits/ExhibitProseSection';
import type { ExhibitSectionKind } from '../../../@types/exhibits/ExhibitSectionKind';

export const proseKind: ExhibitSectionKind<ExhibitProseSection> = {
  Component: ProseSection,
};
