import { describe, expect, it } from 'vitest';
import { buildProjectTree } from '../../../tools/utils/session/buildProjectTree';

const session = (branch: string, output: number) =>
  [
    JSON.stringify({
      type: 'user',
      gitBranch: branch,
      timestamp: '2026-01-01T00:00:00Z',
      message: { role: 'user', content: 'do the thing' },
    }),
    JSON.stringify({
      type: 'assistant',
      gitBranch: branch,
      timestamp: '2026-01-01T00:00:01Z',
      message: {
        id: `msg_${branch}_${output}`,
        role: 'assistant',
        model: 'claude-opus-5',
        content: [],
        usage: {
          input_tokens: 1,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 100,
          output_tokens: output,
        },
      },
    }),
  ].join('\n');

describe('buildProjectTree', () => {
  it('groups sessions on one branch together and ranks branches by spend', () => {
    const tree = buildProjectTree([
      { label: 's1', text: session('feature/a', 5) },
      { label: 's2', text: session('feature/b', 200) },
      { label: 's3', text: session('feature/a', 7) },
    ]);

    expect(tree.children.map((b) => b.label)).toEqual(['feature/b', 'feature/a']);
    const a = tree.children.find((b) => b.label === 'feature/a');
    expect(a?.children.map((s) => s.label)).toEqual(['s1', 's3']);
    expect(a?.total.requests).toBe(2);
    expect(a?.total.output).toBe(12);
    expect(tree.total.billed).toBe(a!.total.billed + 311);
  });

  it('skips transcripts with no billed requests', () => {
    const empty = JSON.stringify({
      type: 'user',
      gitBranch: 'main',
      message: { role: 'user', content: 'hi' },
    });
    const tree = buildProjectTree([
      { label: 'live', text: session('feature/a', 5) },
      { label: 'empty', text: empty },
    ]);

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]?.label).toBe('feature/a');
  });
});
