/**
 * One row of the Roadmap page. `backlog` is the title of its line in the
 * repository's docs/BACKLOG.md, exactly as written there between the `**`;
 * `spec` is a written design under docs/superpowers/specs/. A row has at
 * least one of the two, and a test fails when the line or the file is gone,
 * so a shipped or dropped item cannot stay on the page. `built` names the
 * part of an `in progress` item that is in the repository today.
 */
export type RoadmapItem = {
  id: string;
  title: string;
  text: string;
  state: 'in progress' | 'planned' | 'idea';
  backlog?: string;
  spec?: string;
  built?: string;
};
