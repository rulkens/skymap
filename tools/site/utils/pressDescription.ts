import type { FactSentences } from '../@types/FactSentences';
import { fact } from '../../../packages/website/src/data/fact';
import { sentencesOf } from './sentencesOf';

/** A paragraph made only of the fact registry's own sentences, in the order given; an index past a row's end throws. */
export function pressDescription(picks: readonly FactSentences[]): string {
  return picks
    .flatMap(({ fact: id, sentences }) => {
      const all = sentencesOf(fact(id).text);
      return (sentences ?? all.map((_, i) => i)).map((i) => {
        if (all[i] === undefined) throw new Error(`Fact "${id}" has no sentence ${i}`);
        return all[i];
      });
    })
    .join(' ');
}
