/**
 * One picture of the press kit (`npm run site:press-kit`). `shot` is its manifest id; `file` its name in the
 * kit, without extension, saying what it shows; `credit` is the line to print beside it; `terms` says what
 * the things in the frame state. There is no "free to reuse" flag: the About page tells the reader to ask first.
 */
export type PressPicture = {
  shot: string;
  file: string;
  title: string;
  credit: string;
  terms: string;
};
