import type { DiskView } from '../../../tools/@types/refactor/DiskView';
import type { Overlay } from '../../../tools/@types/refactor/Overlay';
import type { Plan } from '../../../tools/@types/refactor/Plan';
import type { PlanResult } from '../../../tools/@types/refactor/PlanResult';
import { syncOverlay } from '../../../tools/utils/refactor/engine/syncOverlay';
import { foldPlan } from '../../../tools/utils/refactor/foldPlan';
import { engineFixture } from './engineFixture';

/**
 * An engine fixture plus what every planner test needs around it: a disk view of `files`,
 * `read` through the overlay, and `fold`, which applies a plan to the overlay and tells
 * the engine, as the driver does between batch entries.
 */
export function planFixture(files: Record<string, string>, projects?: readonly string[]) {
  const fixture = engineFixture(files, projects);
  const { engine, root } = fixture;
  const abs = (name: string) => `${root}/${name}`;
  const disk: DiskView = {
    read: (file) => files[file.slice(root.length + 1)] ?? '',
    snapshot: () => ({
      texts: new Map(Object.entries(files).map(([name, text]) => [abs(name), text])),
      fileExists: () => true,
    }),
  };
  const overlay: Overlay = { texts: engine.overlay, moves: [], deletes: engine.removed };
  return {
    ...fixture,
    abs,
    disk,
    read: (file: string) => engine.overlay.get(file) ?? disk.read(file),
    texts: () => disk.snapshot().texts,
    fold: (plan: Plan) => syncOverlay(engine, foldPlan(plan, overlay, disk)),
    /** The plan's edits applied to the original files, by root-relative name; throws on a refusal. */
    applied(result: PlanResult): Record<string, string> {
      if (!result.ok) throw new Error(result.refusals.join('; '));
      const out: Record<string, string> = {};
      for (const edit of [...result.plan.edits].sort((x, y) => y.start - x.start)) {
        const name = edit.file.slice(root.length + 1);
        const text = out[name] ?? files[name]!;
        out[name] = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
      }
      return out;
    },
  };
}
