import { describe, expect, it } from 'vitest';

import { createStageGraph } from '../../../../src/services/gpu/lib/createStageGraph';
import type { Stage } from '../../../../src/@types/gpu/Stage';
import type { StageGraph } from '../../../../src/@types/gpu/StageGraph';

describe('createStageGraph', () => {
  it('runs a stage once per key move, not once per run', () => {
    let key = 1;
    let runs = 0;
    const graph = createStageGraph<'a'>([
      { name: 'a', phase: 'sync', after: [], key: () => [key], run: () => runs++ },
    ]);

    graph.run('sync');
    graph.run('sync');
    graph.run('sync');
    expect(runs).toBe(1);

    key = 2;
    graph.run('sync');
    expect(runs).toBe(2);
  });

  it('skips a stage of another phase', () => {
    let runs = 0;
    const graph = createStageGraph<'a'>([
      { name: 'a', phase: 'step', after: [], key: () => [1], run: () => runs++ },
    ]);

    graph.run('sync');
    expect(runs).toBe(0);

    graph.run('step');
    expect(runs).toBe(1);
  });

  it("leaves an unwanted stage's key unrecorded, so it runs when a consumer appears", () => {
    let wanted = false;
    let runs = 0;
    const graph = createStageGraph<'a'>([
      {
        name: 'a',
        phase: 'sync',
        after: [],
        wanted: () => wanted,
        key: () => [1],
        run: () => runs++,
      },
    ]);

    graph.run('sync');
    expect(runs).toBe(0);

    wanted = true;
    graph.run('sync');
    expect(runs).toBe(1);
  });

  it('token(name) changes only when that stage runs', () => {
    let key = 1;
    let otherWanted = false;
    const graph = createStageGraph<'a' | 'b'>([
      { name: 'a', phase: 'sync', after: [], key: () => [key], run: () => {} },
      {
        name: 'b',
        phase: 'sync',
        after: [],
        wanted: () => otherWanted,
        key: () => [1],
        run: () => {},
      },
    ]);

    // `a` runs once, establishing its first token.
    graph.run('sync');
    const afterFirstRun = graph.token('a');

    // Another stage running (or not, because unwanted) leaves `a`'s token untouched.
    graph.run('sync');
    expect(graph.token('a')).toBe(afterFirstRun);
    otherWanted = true;
    graph.run('sync');
    expect(graph.token('a')).toBe(afterFirstRun);

    // `a`'s own key moving and re-running bumps its token.
    key = 2;
    graph.run('sync');
    expect(graph.token('a')).not.toBe(afterFirstRun);
  });

  it('a stage keyed on an upstream token re-runs after the upstream runs', () => {
    let upstreamKey = 1;
    let downstreamRuns = 0;
    let graph: StageGraph<'up' | 'down'>;
    graph = createStageGraph<'up' | 'down'>([
      { name: 'up', phase: 'sync', after: [], key: () => [upstreamKey], run: () => {} },
      {
        name: 'down',
        phase: 'sync',
        after: ['up'],
        key: () => [graph.token('up')],
        run: () => downstreamRuns++,
      },
    ]);

    graph.run('sync');
    expect(downstreamRuns).toBe(1);

    // Downstream's key is unmoved: no re-run.
    graph.run('sync');
    expect(downstreamRuns).toBe(1);

    // Upstream re-runs, bumping its token; downstream's key now moves.
    upstreamKey = 2;
    graph.run('sync');
    expect(downstreamRuns).toBe(2);
  });

  it('retries a throwing stage, and leaves its token unmoved by the failed attempt', () => {
    let shouldThrow = true;
    let runs = 0;
    const graph = createStageGraph<'a'>([
      {
        name: 'a',
        phase: 'sync',
        after: [],
        key: () => [1],
        run: () => {
          runs++;
          if (shouldThrow) throw new Error('boom');
        },
      },
    ]);

    const beforeAnyRun = graph.token('a');
    expect(() => graph.run('sync')).toThrow('boom');
    expect(graph.token('a')).toBe(beforeAnyRun);

    // Same key, so only a stage that recorded nothing on the failure re-runs.
    shouldThrow = false;
    graph.run('sync');
    expect(runs).toBe(2);
    expect(graph.token('a')).not.toBe(beforeAnyRun);
  });

  it('throws when an after-edge points forward in the table', () => {
    const stages: Stage<'a' | 'b'>[] = [
      { name: 'a', phase: 'sync', after: ['b'], key: () => [], run: () => {} },
      { name: 'b', phase: 'sync', after: [], key: () => [], run: () => {} },
    ];
    expect(() => createStageGraph(stages)).toThrow();
  });

  it('throws when a sync stage declares an after-edge to an earlier step stage', () => {
    const stages: Stage<'early' | 'late'>[] = [
      { name: 'early', phase: 'step', after: [], key: () => [], run: () => {} },
      { name: 'late', phase: 'sync', after: ['early'], key: () => [], run: () => {} },
    ];
    expect(() => createStageGraph(stages)).toThrow();
  });

  it('throws when an after-edge names an unknown stage', () => {
    const stages: Stage<'a'>[] = [
      { name: 'a', phase: 'sync', after: ['ghost' as 'a'], key: () => [], run: () => {} },
    ];
    expect(() => createStageGraph(stages)).toThrow();
  });
});
