/**
 * ExhibitSection — one block of an `Exhibit`'s on-scene notes, discriminated
 * by `kind`. The kinds are structurally different (prose, a legend, a
 * figure grid, a link list, a timeline), so `ExhibitOverlay` branches on `kind` rather
 * than flattening them into a common heading+text shape.
 */

import type { ExhibitProseSection } from './ExhibitProseSection';
import type { ExhibitKeySection } from './ExhibitKeySection';
import type { ExhibitFactsSection } from './ExhibitFactsSection';
import type { ExhibitSourcesSection } from './ExhibitSourcesSection';
import type { ExhibitTimelineSection } from './ExhibitTimelineSection';

export type ExhibitSection =
  | ExhibitProseSection
  | ExhibitKeySection
  | ExhibitFactsSection
  | ExhibitSourcesSection
  | ExhibitTimelineSection;
