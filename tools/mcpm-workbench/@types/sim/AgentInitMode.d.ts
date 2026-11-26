/**
 * AgentInitMode — how the free-flowing agents (the indices past the catalog
 * points) are scattered at seed time. The fork's two mutually exclusive
 * #ifdef arms, AGENTS_INIT_AROUND_DATA and AGENTS_INIT_RANDOMLY.
 */
export type AgentInitMode = 'aroundData' | 'uniform';
