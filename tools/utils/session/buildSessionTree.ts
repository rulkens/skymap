import type { SessionTokenNode } from './SessionTokenNode';
import type { TokenTotals } from './TokenTotals';

// Turns a Claude Code transcript (~/.claude/projects/<slug>/<id>.jsonl) into a token
// attribution tree: session > turn > [skill span] > request, with subagent transcripts
// spliced in where their spawning Agent call sits.
//
// Every API request is attributed to exactly one node, so totals roll up without
// double counting. A skill span starts at the request *after* its Skill tool_use —
// that request's cacheWrite is the cost of loading the skill's instructions.

type Entry = {
  type?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  sourceToolUseID?: string;
  timestamp?: string;
  message?: {
    id?: string;
    role?: string;
    model?: string;
    content?: unknown;
    usage?: Record<string, number | Record<string, number>>;
  };
  toolUseResult?: { agentId?: string };
  attributionAgent?: string;
};

type ToolCall = { id: string; name: string; skill?: string };

const zero = (): TokenTotals => ({
  requests: 0,
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  billed: 0,
});

const add = (a: TokenTotals, b: TokenTotals): TokenTotals => ({
  requests: a.requests + b.requests,
  input: a.input + b.input,
  output: a.output + b.output,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  cacheRead: a.cacheRead + b.cacheRead,
  billed: a.billed + b.billed,
});

const parseLines = (text: string): Entry[] =>
  text
    .split('\n')
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Entry];
      } catch {
        return [];
      }
    });

const blocks = (content: unknown): Record<string, unknown>[] =>
  Array.isArray(content) ? (content as Record<string, unknown>[]) : [];

const firstText = (content: unknown): string => {
  if (typeof content === 'string') return content;
  for (const b of blocks(content)) {
    if (b.type === 'text' && typeof b.text === 'string') return b.text;
  }
  return '';
};

/** A human prompt, not a tool result, a skill injection or an attachment. */
const isTurnStart = (e: Entry): boolean => {
  if (e.type !== 'user' || !e.message || e.isMeta) return false;
  if (typeof e.message.content === 'string') return true;
  const bs = blocks(e.message.content);
  return bs.length > 0 && !bs.some((b) => b.type === 'tool_result');
};

const label = (text: string, max = 100): string => {
  const flat = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const totalsOf = (usage: NonNullable<Entry['message']>['usage']): TokenTotals => {
  const n = (k: string): number => (typeof usage?.[k] === 'number' ? (usage[k] as number) : 0);
  const t = {
    requests: 1,
    input: n('input_tokens'),
    output: n('output_tokens'),
    cacheWrite: n('cache_creation_input_tokens'),
    cacheRead: n('cache_read_input_tokens'),
    billed: 0,
  };
  return { ...t, billed: t.input + t.output + t.cacheWrite + t.cacheRead };
};

const rollUp = (node: SessionTokenNode): SessionTokenNode => {
  node.children.forEach(rollUp);
  node.total = node.children.reduce((acc, c) => add(acc, c.total), node.self);
  const first = node.children[0];
  const last = node.children[node.children.length - 1];
  if (first && last) {
    node.startedAt = node.startedAt || first.startedAt;
    node.endedAt = last.endedAt || node.endedAt;
  }
  return node;
};

const node = (kind: SessionTokenNode['kind'], text: string, at: string): SessionTokenNode => ({
  kind,
  label: text,
  startedAt: at,
  endedAt: at,
  self: zero(),
  total: zero(),
  children: [],
});

const parseChain = (
  text: string,
  root: SessionTokenNode,
  subagents: ReadonlyMap<string, string>,
): SessionTokenNode => {
  const entries = parseLines(text);

  // One assistant message is written as several lines (one per content block), each
  // repeating the same cumulative `usage`. Merge by message.id or the tokens triple-count.
  const merged = new Map<string, { entry: Entry; tools: ToolCall[] }>();
  const order: string[] = [];
  const toolAgent = new Map<string, string>();

  for (const e of entries) {
    if (e.type === 'user') {
      for (const b of blocks(e.message?.content)) {
        if (b.type === 'tool_result' && e.toolUseResult?.agentId) {
          toolAgent.set(String(b.tool_use_id), e.toolUseResult.agentId);
        }
      }
    }
    if (e.type !== 'assistant' || !e.message?.id) continue;
    const id = e.message.id;
    if (!merged.has(id)) {
      merged.set(id, { entry: e, tools: [] });
      order.push(id);
    }
    const slot = merged.get(id)!;
    if (!slot.entry.message?.usage && e.message.usage) slot.entry = e;
    for (const b of blocks(e.message.content)) {
      if (b.type !== 'tool_use') continue;
      const input = (b.input ?? {}) as { skill?: string };
      slot.tools.push({
        id: String(b.id),
        name: String(b.name),
        skill: b.name === 'Skill' ? input.skill : undefined,
      });
    }
  }

  const skillByToolId = new Map<string, string>();
  for (const { tools } of merged.values()) {
    for (const t of tools) if (t.skill) skillByToolId.set(t.id, t.skill);
  }

  let turn: SessionTokenNode | null = null;
  let skill: SessionTokenNode | null = null;
  const seen = new Set<string>();

  for (const e of entries) {
    // A skill's instructions arrive as a meta user turn pointing back at its Skill call.
    // Everything the model does from there until the next human prompt is that skill's cost.
    const injected =
      e.isMeta && e.sourceToolUseID ? skillByToolId.get(e.sourceToolUseID) : undefined;
    if (injected && turn) {
      skill = node('skill', `skill: ${injected}`, e.timestamp ?? '');
      turn.children.push(skill);
      continue;
    }
    if (isTurnStart(e) && !e.isSidechain) {
      turn = node('turn', label(firstText(e.message?.content)), e.timestamp ?? '');
      root.children.push(turn);
      skill = null;
      continue;
    }
    if (e.type !== 'assistant' || !e.message?.id || seen.has(e.message.id)) continue;
    const slot = merged.get(e.message.id);
    if (!slot?.entry.message?.usage) continue;
    seen.add(e.message.id);

    if (!turn) {
      turn = node('turn', '(before first prompt)', e.timestamp ?? '');
      root.children.push(turn);
    }

    const req = node(
      'request',
      slot.tools.map((t) => t.name).join(', ') || 'reply',
      e.timestamp ?? '',
    );
    req.model = slot.entry.message.model;
    req.tools = slot.tools.map((t) => t.name);
    req.self = totalsOf(slot.entry.message.usage);
    (skill ?? turn).children.push(req);

    for (const t of slot.tools) {
      const agentId = toolAgent.get(t.id);
      if (agentId && subagents.has(agentId)) {
        const sub = node(
          'subagent',
          t.name === 'Agent' ? `subagent: ${t.id}` : t.name,
          e.timestamp ?? '',
        );
        const subText = subagents.get(agentId)!;
        const kind = parseLines(subText).find((x) => x.attributionAgent)?.attributionAgent;
        sub.label = `subagent: ${kind ?? 'unknown'}`;
        parseChain(subText, sub, subagents);
        req.children.push(sub);
      }
    }
  }

  return root;
};

export function buildSessionTree(
  main: string,
  subagents: ReadonlyMap<string, string> = new Map(),
  sessionLabel = 'session',
): SessionTokenNode {
  // Older CLI builds inline subagent turns in the main transcript instead of writing
  // subagents/agent-<id>.jsonl. Split them back out so both layouts parse the same.
  const inline = new Map<string, string[]>();
  const trunk: string[] = [];
  for (const line of main.split('\n')) {
    if (line.length === 0) continue;
    let e: Entry & { agentId?: string };
    try {
      e = JSON.parse(line) as Entry & { agentId?: string };
    } catch {
      continue;
    }
    if (e.isSidechain && e.agentId) {
      inline.set(e.agentId, [...(inline.get(e.agentId) ?? []), line]);
    } else if (!e.isSidechain) {
      trunk.push(line);
    }
  }
  const all = new Map(subagents);
  for (const [id, lines] of inline) if (!all.has(id)) all.set(id, lines.join('\n'));

  const root = node('session', sessionLabel, '');
  parseChain(trunk.join('\n'), root, all);
  // Subagent chains have no human turns; drop the synthetic wrapper so they read flat.
  const flatten = (n: SessionTokenNode): void => {
    n.children = n.children.flatMap((c) =>
      c.kind === 'turn' && c.label === '(before first prompt)' && n.kind === 'subagent'
        ? c.children
        : [c],
    );
    n.children.forEach(flatten);
  };
  flatten(root);
  return rollUp(root);
}
