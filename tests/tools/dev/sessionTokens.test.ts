import { describe, expect, it } from 'vitest';
import { buildSessionTree } from '../../../tools/utils/session/buildSessionTree';
import type { SessionTokenNode } from '../../../tools/utils/session/SessionTokenNode';

const usage = (output: number) => ({
  input_tokens: 1,
  cache_creation_input_tokens: 10,
  cache_read_input_tokens: 100,
  output_tokens: output,
});

const prompt = (text: string) =>
  JSON.stringify({
    type: 'user',
    timestamp: '2026-01-01T00:00:00Z',
    message: { role: 'user', content: text },
  });

const reply = (id: string, output: number, content: unknown[], block = 0) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-01-01T00:00:01Z',
    apiBlockIndex: block,
    message: { id, role: 'assistant', model: 'claude-opus-5', content, usage: usage(output) },
  });

const toolResult = (toolUseId: string, agentId?: string) =>
  JSON.stringify({
    type: 'user',
    timestamp: '2026-01-01T00:00:02Z',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }],
    },
    ...(agentId ? { toolUseResult: { agentId } } : {}),
  });

const find = (n: SessionTokenNode, kind: SessionTokenNode['kind']): SessionTokenNode | undefined =>
  n.kind === kind ? n : n.children.map((c) => find(c, kind)).find(Boolean);

describe('buildSessionTree', () => {
  it('counts a multi-block assistant message once', () => {
    // Each content block is written as its own line repeating the same cumulative usage.
    const tree = buildSessionTree(
      [
        prompt('hi'),
        reply('msg_1', 5, [{ type: 'text', text: 'thinking' }], 0),
        reply('msg_1', 5, [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} }], 1),
        reply('msg_1', 5, [{ type: 'text', text: 'done' }], 2),
      ].join('\n'),
    );

    expect(tree.total.requests).toBe(1);
    expect(tree.total.billed).toBe(116);
    expect(find(tree, 'request')?.tools).toEqual(['Bash']);
  });

  it('attributes a subagent transcript under the Agent call that spawned it', () => {
    const sub = [
      prompt('go look'),
      JSON.stringify({
        type: 'assistant',
        isSidechain: true,
        attributionAgent: 'Explore',
        timestamp: '2026-01-01T00:00:03Z',
        message: {
          id: 'msg_sub',
          role: 'assistant',
          model: 'claude-opus-5',
          content: [],
          usage: usage(7),
        },
      }),
    ].join('\n');

    const tree = buildSessionTree(
      [
        prompt('hi'),
        reply('msg_1', 5, [{ type: 'tool_use', id: 'toolu_1', name: 'Agent', input: {} }]),
        toolResult('toolu_1', 'agent_abc'),
      ].join('\n'),
      new Map([['agent_abc', sub]]),
    );

    const subagent = find(tree, 'subagent');
    expect(subagent?.label).toBe('subagent: Explore');
    expect(subagent?.total.billed).toBe(118);
    // Parent request keeps its own tokens; the session total covers both.
    expect(tree.total.billed).toBe(116 + 118);
    expect(tree.total.requests).toBe(2);
  });

  it('bills work done after a skill loads to that skill, not to a new turn', () => {
    // Skill instructions arrive as a meta user turn; read as a prompt it would split the turn.
    const injection = JSON.stringify({
      type: 'user',
      isMeta: true,
      sourceToolUseID: 'toolu_1',
      timestamp: '2026-01-01T00:00:03Z',
      message: { role: 'user', content: 'You are a performance engineer…' },
    });

    const tree = buildSessionTree(
      [
        prompt('hi'),
        reply('msg_1', 5, [
          { type: 'tool_use', id: 'toolu_1', name: 'Skill', input: { skill: 'perf' } },
        ]),
        toolResult('toolu_1'),
        injection,
        reply('msg_2', 9, [{ type: 'text', text: 'using the skill' }]),
      ].join('\n'),
    );

    expect(tree.children).toHaveLength(1);
    const turn = tree.children[0];
    expect(turn?.children.map((c) => c.kind)).toEqual(['request', 'skill']);
    const skill = find(tree, 'skill');
    expect(skill?.label).toBe('skill: perf');
    expect(skill?.total.requests).toBe(1);
    expect(skill?.total.output).toBe(9);
  });
});
