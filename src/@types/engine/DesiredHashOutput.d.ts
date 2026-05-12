/**
 * Output of the pure desired-hash decision.
 *
 * `desiredHashBody` is the bit *after* `#`, lacking the leading `#`,
 * so the caller can decide whether to write `pathname + '#' + body` or
 * just `pathname` (when the body is empty).  `matches` lets the caller
 * skip the `replaceState` write when the URL already says the right
 * thing, which avoids spurious history-state churn under React strict
 * mode and during noisy state updates that don't actually change the
 * selection.
 */
export type DesiredHashOutput = {
  desiredHashBody: string;
  matches: boolean;
};
