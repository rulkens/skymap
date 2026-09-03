import { describe, expect, it } from 'vitest';

import { createStageGraph } from '../../../../src/services/gpu/lib/createStageGraph';
import type { Stage } from '../../../../src/@types/gpu/Stage';

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

  it('re-runs a stage after its after-edge upstream runs, and not when the upstream is skipped by an unmoved key', () => {
    let upstreamKey = 1;
    let downstreamRuns = 0;
    const graph = createStageGraph<'up' | 'down'>([
      { name: 'up', phase: 'sync', after: [], key: () => [upstreamKey], run: () => {} },
      {
        name: 'down',
        phase: 'sync',
        after: ['up'],
        key: () => [],
        run: () => downstreamRuns++,
      },
    ]);

    graph.run('sync');
    expect(downstreamRuns).toBe(1);

    // Upstream's key is unmoved, so it's skipped — downstream's effective key
    // (upstream's token) is untouched too.
    graph.run('sync');
    expect(downstreamRuns).toBe(1);

    // Upstream re-runs, bumping its token; downstream's effective key now moves.
    upstreamKey = 2;
    graph.run('sync');
    expect(downstreamRuns).toBe(2);
  });

  it('does not re-run a stage on account of an after-edge upstream that was unwanted this cycle', () => {
    let upstreamWanted = true;
    let downstreamRuns = 0;
    const graph = createStageGraph<'up' | 'down'>([
      {
        name: 'up',
        phase: 'sync',
        after: [],
        wanted: () => upstreamWanted,
        key: () => [1],
        run: () => {},
      },
      { name: 'down', phase: 'sync', after: ['up'], key: () => [], run: () => downstreamRuns++ },
    ]);

    graph.run('sync');
    expect(downstreamRuns).toBe(1);

    // Upstream skipped this cycle (unwanted): its token is untouched, so
    // downstream's effective key is untouched too.
    upstreamWanted = false;
    graph.run('sync');
    expect(downstreamRuns).toBe(1);
  });

  it('retries a throwing stage, and leaves its downstream unmoved by the failed attempt', () => {
    let shouldThrow = true;
    let upRuns = 0;
    let downRuns = 0;
    const graph = createStageGraph<'up' | 'down'>([
      {
        name: 'up',
        phase: 'sync',
        after: [],
        key: () => [1],
        run: () => {
          upRuns++;
          if (shouldThrow) throw new Error('boom');
        },
      },
      { name: 'down', phase: 'sync', after: ['up'], key: () => [], run: () => downRuns++ },
    ]);

    expect(() => graph.run('sync')).toThrow('boom');
    expect(downRuns).toBe(0);

    // Same key, so only a stage that recorded nothing on the failure re-runs;
    // `down` only now sees the upstream's first successful run.
    shouldThrow = false;
    graph.run('sync');
    expect(upRuns).toBe(2);
    expect(downRuns).toBe(1);
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

  it('passes the context through to wanted, key and run', () => {
    type Ctx = { readonly multiplier: number };
    const seen: { wanted?: Ctx; key?: Ctx; run?: Ctx } = {};
    const graph = createStageGraph<'a', Ctx>([
      {
        name: 'a',
        phase: 'sync',
        after: [],
        wanted: (ctx) => {
          seen.wanted = ctx;
          return true;
        },
        key: (ctx) => {
          seen.key = ctx;
          return [ctx.multiplier];
        },
        run: (ctx) => {
          seen.run = ctx;
        },
      },
    ]);

    const ctx: Ctx = { multiplier: 3 };
    graph.run('sync', ctx);

    expect(seen.wanted).toBe(ctx);
    expect(seen.key).toBe(ctx);
    expect(seen.run).toBe(ctx);
  });
});
