/** Some sentences of one row of the site's fact registry, by index from 0; all of them when `sentences` is absent. */
export type FactSentences = {
  fact: string;
  sentences?: readonly number[];
};
