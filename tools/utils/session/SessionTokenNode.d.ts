import type { TokenTotals } from './TokenTotals';

export type SessionTokenNode = {
  kind: 'project' | 'branch' | 'session' | 'turn' | 'skill' | 'subagent' | 'request';
  label: string;
  startedAt: string;
  endedAt: string;
  model?: string;
  /** Tools invoked by this request, in call order. Tools carry no tokens of their own. */
  tools?: string[];
  /** Tokens billed to this node itself (requests attributed here, not to a child). */
  self: TokenTotals;
  /** self plus every descendant. */
  total: TokenTotals;
  children: SessionTokenNode[];
};
