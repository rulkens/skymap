/**
 * The fork's UI offers agents in millions; the dispatch quantum is 100k —
 * also the propagate dispatch's truncation granularity (encodeStep.ts).
 */
export const AGENT_COUNT_STEP = 100_000;
