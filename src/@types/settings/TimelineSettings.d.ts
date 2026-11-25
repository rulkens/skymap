/**
 * TimelineSettings — the `settings.timeline` cluster: what a timeline exhibit's panel and scene
 * share. A timeline exhibit seeds it through its snapshot and the takeover bracket restores it.
 */
export type TimelineSettings = {
  /** The selected lane's body id: its trail and caption stay full strength while the other
   *  sampled bodies dim; null = no emphasis. */
  readonly lane: string | null;
  /** The `MISSION_SPEEDS` factor the timeline clock plays at; snapshots carry it, the URL does not. */
  readonly speed: number;
};
