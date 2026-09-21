/** ExhibitFactsSection — a two-column grid of figures; it carries no heading, only cells. */

import type { ExhibitFact } from './ExhibitFact';

export type ExhibitFactsSection = { kind: 'facts'; facts: readonly ExhibitFact[] };
