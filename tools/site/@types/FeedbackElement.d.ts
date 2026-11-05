/**
 * The element a note is about, described so an agent can find its source:
 * `source` is the Astro file and `line:column` from the dev build, taken from
 * the nearest ancestor when the element itself carries none (`inherited`).
 */
export type FeedbackElement = {
  selector: string;
  tag: string;
  id: string | null;
  classes: string[];
  heading: string | null;
  text: string;
  source: { file: string; loc: string; inherited: boolean } | null;
};
