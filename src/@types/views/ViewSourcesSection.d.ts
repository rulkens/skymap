/** ViewSourcesSection — the provenance list closing a `View`'s notes column. */

import type { ViewSource } from './ViewSource';

export type ViewSourcesSection = { kind: 'sources'; heading: string; links: readonly ViewSource[] };
