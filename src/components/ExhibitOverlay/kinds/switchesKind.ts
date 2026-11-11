import SwitchesSection from './SwitchesSection';
import type { ExhibitSwitchesSection } from '../../../@types/exhibits/ExhibitSwitchesSection';
import type { ExhibitSectionKind } from '../../../@types/exhibits/ExhibitSectionKind';

export const switchesKind: ExhibitSectionKind<ExhibitSwitchesSection> = {
  Component: SwitchesSection,
};
