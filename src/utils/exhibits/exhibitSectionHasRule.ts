import type { ExhibitSection } from '../../@types/exhibits/ExhibitSection';

/** The data blocks sit behind a hairline; exhaustive so a new kind must choose. */
export function exhibitSectionHasRule(section: ExhibitSection): boolean {
  switch (section.kind) {
    case 'prose':
    case 'key':
      return false;
    case 'facts':
    case 'sources':
      return true;
    default: {
      const unreachable: never = section;
      return unreachable;
    }
  }
}
