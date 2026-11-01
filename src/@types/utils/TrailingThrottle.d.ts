/** A time gate whose turned-away calls leave one trailing call behind; see `throttleWithTrailingCall`. */
export type TrailingThrottle = {
  /** True at most once per interval, keyed on the caller's `nowMs`. */
  readonly pass: (nowMs: number) => boolean;
  /** Drops a pending trailing call; the owner's teardown calls it. */
  readonly cancel: () => void;
};
