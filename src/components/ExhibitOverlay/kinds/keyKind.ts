import KeySection from './KeySection';
import type { ExhibitKeySection } from '../../../@types/exhibits/ExhibitKeySection';
import type { ExhibitSectionKind } from '../../../@types/exhibits/ExhibitSectionKind';

export const keyKind: ExhibitSectionKind<ExhibitKeySection> = {
  id: 'key',
  Component: KeySection,
};
