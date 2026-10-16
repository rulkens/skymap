/**
 * VoyagerMilestone — a cited, not measured, event of a craft's life. `iso` ends in
 * `T00:00:00.000Z` when the source gives only a day.
 */
export type VoyagerMilestone = {
  craftId: string;
  id: string;
  kind: 'milestone' | 'boundary';
  iso: string;
  label: string;
};
