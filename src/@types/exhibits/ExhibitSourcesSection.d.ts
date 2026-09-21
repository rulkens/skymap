/** ExhibitSourcesSection — the provenance list closing an `Exhibit`'s notes column. */

import type { ExhibitSource } from './ExhibitSource';

export type ExhibitSourcesSection = {
  kind: 'sources';
  heading: string;
  links: readonly ExhibitSource[];
};
