/** One section of a landing page: the h2 or h3 text it carries, and the reader's question it answers. `parts` are its h3s. */
export type PageSection = { heading: string; job: string; parts?: PageSection[] };
