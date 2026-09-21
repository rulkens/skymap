/** ViewFactsSection — a two-column grid of figures; it carries no heading, only cells. */

import type { ViewFact } from './ViewFact';

export type ViewFactsSection = { kind: 'facts'; facts: readonly ViewFact[] };
