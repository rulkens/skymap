import { buildSessionTree } from './buildSessionTree';
import type { SessionTokenNode } from './SessionTokenNode';
import type { TokenTotals } from './TokenTotals';

// Rolls many session transcripts up into one tree grouped by git branch, so a feature
// that ran across several sessions — and several PRs — reads as a single figure.
// Branch comes from the `gitBranch` field the CLI stamps on every transcript line.

export type SessionSource = {
  label: string;
  text: string;
  subagents?: ReadonlyMap<string, string>;
};

const sum = (nodes: SessionTokenNode[]): TokenTotals =>
  nodes.reduce<TokenTotals>(
    (a, n) => ({
      requests: a.requests + n.total.requests,
      input: a.input + n.total.input,
      output: a.output + n.total.output,
      cacheWrite: a.cacheWrite + n.total.cacheWrite,
      cacheRead: a.cacheRead + n.total.cacheRead,
      billed: a.billed + n.total.billed,
    }),
    { requests: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, billed: 0 },
  );

const branchOf = (text: string): string => {
  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    try {
      const branch = (JSON.parse(line) as { gitBranch?: string }).gitBranch;
      if (branch) return branch;
    } catch {
      continue;
    }
  }
  return '(no branch)';
};

const wrap = (
  kind: SessionTokenNode['kind'],
  label: string,
  children: SessionTokenNode[],
): SessionTokenNode => ({
  kind,
  label,
  startedAt: children[0]?.startedAt ?? '',
  endedAt: children[children.length - 1]?.endedAt ?? '',
  self: sum([]),
  total: sum(children),
  children,
});

export function buildProjectTree(
  sources: readonly SessionSource[],
  label = 'project',
): SessionTokenNode {
  const byBranch = new Map<string, SessionTokenNode[]>();

  for (const source of sources) {
    const tree = buildSessionTree(source.text, source.subagents ?? new Map(), source.label);
    if (tree.total.requests === 0) continue;
    const branch = branchOf(source.text);
    byBranch.set(branch, [...(byBranch.get(branch) ?? []), tree]);
  }

  const branches = [...byBranch.entries()]
    .map(([name, sessions]) => {
      sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      return wrap('branch', name, sessions);
    })
    .sort((a, b) => b.total.billed - a.total.billed);

  return wrap('project', label, branches);
}
