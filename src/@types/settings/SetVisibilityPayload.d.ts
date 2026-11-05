/** One visibility switch to write: `settings[cluster][field]`, or that field of one item row. */
export type SetVisibilityPayload = {
  readonly cluster: string;
  readonly item?: string;
  readonly field: 'enabled' | 'labelEnabled';
  readonly on: boolean;
  /** A cue's duration (ms) for the fade this write starts: `0` snaps, absent means the default
   * durations. Read by the reactive fade sync, never stored. */
  readonly overMs?: number;
};
