/**
 * createStageGraph — the effect half of the field pipeline: a table of stages
 * run in declared order, each gated on the same two axes as `createKeyedRebuild`
 * (consumer liveness, inputs moved) collapsed into one call per phase.
 *
 * No topological sort: table order IS the schedule, and `after` only proves it
 * — a stage naming a dependency that appears later in the array is a bug caught
 * at construction, not tie-broken silently. `after` also IS the re-run edge:
 * each stage's effective key is its after-edges' tokens (opaque identities that
 * change exactly when the upstream stage last ran) followed by its own `key(ctx)`.
 */

import type { Stage } from '../../../@types/gpu/Stage';
import type { StageGraph } from '../../../@types/gpu/StageGraph';
import type { StagePhase } from '../../../@types/gpu/StagePhase';

export function createStageGraph<Name extends string, Ctx = void>(
  stages: readonly Stage<Name, Ctx>[],
): StageGraph<Name, Ctx> {
  const declared = new Map<Name, { readonly index: number; readonly phase: StagePhase }>(
    stages.map((stage, index) => [stage.name, { index, phase: stage.phase }]),
  );
  for (const [i, stage] of stages.entries()) {
    for (const dep of stage.after) {
      const target = declared.get(dep);
      if (target === undefined) {
        throw new Error(`createStageGraph: "${stage.name}" names unknown after-edge "${dep}"`);
      }
      if (target.index >= i) {
        throw new Error(
          `createStageGraph: "${stage.name}" has a forward after-edge to "${dep}" — ` +
            `"${dep}" must appear earlier in the table`,
        );
      }
      // Table order only orders stages WITHIN a phase; across phases the caller's
      // `run('sync')` always precedes `run('step')`, so this edge would read as
      // satisfied at construction and be violated on every cycle.
      if (target.phase === 'step' && stage.phase === 'sync') {
        throw new Error(
          `createStageGraph: sync stage "${stage.name}" has an after-edge to step stage "${dep}" — ` +
            `sync runs first, so the edge can never hold`,
        );
      }
    }
  }

  const lastKeys = new Map<Name, readonly unknown[]>();
  const tokens = new Map<Name, object>();

  function token(name: Name): object {
    let t = tokens.get(name);
    if (t === undefined) {
      t = {};
      tokens.set(name, t);
    }
    return t;
  }

  return {
    run(phase: StagePhase, ctx: Ctx): void {
      for (const stage of stages) {
        if (stage.phase !== phase) continue;
        if (stage.wanted?.(ctx) === false) continue;

        const key = [...stage.after.map(token), ...stage.key(ctx)];
        const lastKey = lastKeys.get(stage.name);
        if (lastKey !== undefined && sameKey(lastKey, key)) continue;

        // Recorded only after `run` returns: a throw must leave the stage owing
        // its work, and must not bump a token downstream stages would read as
        // "the effect landed". Still before the next row's `key()`, so a
        // same-cycle transitive edge sees the bump.
        stage.run(ctx);
        lastKeys.set(stage.name, key);
        tokens.set(stage.name, {});
      }
    },
  };
}

function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}
