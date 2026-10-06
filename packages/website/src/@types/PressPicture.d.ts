/**
 * One picture offered for reuse on the About page. `shot` is its manifest id;
 * `credit` is the line to print beside it; `terms` says what the things in the
 * frame allow, and `nonCommercial` is set when any of them is limited to
 * non-commercial use.
 */
export type PressPicture = {
  shot: string;
  title: string;
  credit: string;
  terms: string;
  nonCommercial: boolean;
};
