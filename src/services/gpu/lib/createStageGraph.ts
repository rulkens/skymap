/**
 * createStageGraph — the effect half of the field pipeline: a table of stages
 * run in declared order, each gated on the same two axes as `createKeyedRebuild`
 * (consumer liveness, inputs moved) collapsed into one call per phase.
 *
 * No topological sort: table order IS the schedule, and `after` only proves it
 * — a stage naming a dependency that appears later in the array is a bug caught
 * at construction, not tie-broken silently. `token(name)` gives a downstream
 * stage a key element that changes exactly when an upstream stage last ran.
 */

import type { Stage } from '../../../@types/gpu/Stage';
import type { StageGraph } from '../../../@types/gpu/StageGraph';
import type { StagePhase } from '../../../@types/gpu/StagePhase';

export function createStageGraph<Name extends string>(
  stages: readonly Stage<Name>[],
): StageGraph<Name> {
  const indexOf = new Map<Name, number>(stages.map((stage, i) => [stage.name, i]));
  for (const [i, stage] of stages.entries()) {
    for (const dep of stage.after) {
      const depIndex = indexOf.get(dep);
      if (depIndex === undefined) {
        throw new Error(`createStageGraph: "${stage.name}" names unknown after-edge "${dep}"`);
      }
      if (depIndex >= i) {
        throw new Error(
          `createStageGraph: "${stage.name}" has a forward after-edge to "${dep}" — ` +
            `"${dep}" must appear earlier in the table`,
        );
      }
    }
  }

  const lastKeys = new Map<Name, readonly unknown[]>();
  const tokens = new Map<Name, object>();

  return {
    run(phase: StagePhase): void {
      for (const stage of stages) {
        if (stage.phase !== phase) continue;
        if (stage.wanted?.() === false) continue;

        const key = stage.key();
        const lastKey = lastKeys.get(stage.name);
        if (lastKey !== undefined && sameKey(lastKey, key)) continue;

        lastKeys.set(stage.name, key);
        tokens.set(stage.name, {});
        stage.run();
      }
    },
    token(name: Name): object {
      let token = tokens.get(name);
      if (token === undefined) {
        token = {};
        tokens.set(name, token);
      }
      return token;
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
