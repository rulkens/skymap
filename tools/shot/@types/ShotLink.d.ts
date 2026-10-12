/** A link reduced to what the tool appends to its own server: no origin, no path. */
export type ShotLink = {
  readonly search: string; // without the leading '?', '' when absent
  readonly hash: string; // without the leading '#', '' when absent
};
