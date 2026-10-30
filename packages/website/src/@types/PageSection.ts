/**
 * One section of a landing page: the h2 or h3 text it carries, and the reader's question it answers.
 * `parts` are its h3s. `layout`, `visual`, `shots` and `component` are design notes that only the
 * dev sketch page reads (src/dev/sketch); the built page never uses them.
 */
export type PageSection = {
  heading: string;
  job: string;
  layout?: string;
  visual?: string;
  shots?: string[];
  component?: string;
  parts?: PageSection[];
};
