/**
 * validateSeqStepOrder — rule 6 of seq overlap: an overlap may reorder scene steps
 * in time, but the tour rebuilds scenes by folding them in WRITTEN (tree) order, so
 * a later-written step that applies earlier than an earlier-written one setting the
 * same thing would play one way and rebuild the other. `steps` must be in push
 * order (`acc.steps`), never the time-sorted copy.
 */
import type { SeqSteps } from '../../../@types/animation/SeqSteps';
import type { SceneStep } from '../../../@types/animation/compiledClip/SceneStep';
import { stepOrderKeys } from './stepOrderKeys';
import { CompileFault } from './CompileFault';

export function validateSeqStepOrder(seqs: readonly SeqSteps[], steps: readonly SceneStep[]): void {
  for (const { startSec, steps: spans } of seqs) {
    for (let k = 0; k + 1 < spans.length; k++) {
      const written = steps.slice(spans[0]!.steps[0], spans[k]!.steps[1]);
      const later = steps.slice(spans[k + 1]!.steps[0], spans[spans.length - 1]!.steps[1]);
      for (const a of written) {
        const keys = stepOrderKeys(a);
        for (const b of later) {
          if (b.atSec >= a.atSec || !stepOrderKeys(b).some((key) => keys.includes(key))) continue;
          throw new CompileFault(
            `seq at ${startSec}s, join ${k + 1}: a '${b.effect.kind}' written after a '${a.effect.kind}' fires earlier (${b.atSec}s < ${a.atSec}s) and sets the same thing; the tour rebuilds scenes in written order`,
            'cueOrder',
            [b],
          );
        }
      }
    }
  }
}
