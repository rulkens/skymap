/**
 * ViewSection — one block of a `View`'s on-scene notes, discriminated by `kind`.
 * The four kinds are structurally different (prose, a legend, a figure grid, a
 * link list), so `ViewOverlay` branches on `kind` rather than flattening them
 * into a common heading+text shape.
 */

import type { ViewProseSection } from './ViewProseSection';
import type { ViewKeySection } from './ViewKeySection';
import type { ViewFactsSection } from './ViewFactsSection';
import type { ViewSourcesSection } from './ViewSourcesSection';

export type ViewSection = ViewProseSection | ViewKeySection | ViewFactsSection | ViewSourcesSection;
