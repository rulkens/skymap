/**
 * validateSeqCueOrder — rule 6 of seq overlap: an overlap may reorder cues in
 * time, but the tour rebuilds scenes by folding cues in WRITTEN (tree) order, so
 * a later-written cue that fires earlier than an earlier-written one setting the
 * same thing would play one way and rebuild the other. `cues` must be in push
 * order (`acc.cues`), never the time-sorted copy.
 */
import type { SeqSteps } from '../../../@types/animation/SeqSteps';
import type { SceneCue } from '../../../@types/animation/compiledClip/SceneCue';
import { cueOrderKeys } from './cueOrderKeys';
import { CompileFault } from './CompileFault';

export function validateSeqCueOrder(seqs: readonly SeqSteps[], cues: readonly SceneCue[]): void {
  for (const { startSec, steps } of seqs) {
    for (let k = 0; k + 1 < steps.length; k++) {
      const written = cues.slice(steps[0]!.cues[0], steps[k]!.cues[1]);
      const later = cues.slice(steps[k + 1]!.cues[0], steps[steps.length - 1]!.cues[1]);
      for (const a of written) {
        const keys = cueOrderKeys(a);
        for (const b of later) {
          if (b.atSec >= a.atSec || !cueOrderKeys(b).some((key) => keys.includes(key))) continue;
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
