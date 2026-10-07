/**
 * One picture shown with its terms on the About page. `shot` is its manifest
 * id; `credit` is the line to print beside it; `terms` says what the things in
 * the frame state. There is no "free to reuse" flag: every picture so far
 * holds a source with no licence, and the page tells the reader to ask first.
 */
export type PressPicture = {
  shot: string;
  title: string;
  credit: string;
  terms: string;
};
