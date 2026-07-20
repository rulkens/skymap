/**
 * budgetTone — classify a MERGED per-frame median against the frame budget into
 * a three-step severity tone (`green` fits, `yellow` slips, `red` is clearly
 * over). It is the per-FRAME verdict: does a whole frame's timed GPU work fit
 * inside a display refresh?
 *
 * Extracted per the second-use rule: three consumers now need this exact
 * threshold — the TOTAL fps-ceiling color, the SUMMARY verdict line, and the
 * cross-scenario roll-up verdict. Inlining the ternary in each invited the three
 * to drift, so the thresholds live once here and each caller maps the returned
 * tone through its own palette (`palette[tone](text)`).
 *
 * This returns a tone NAME, not a colorizer, on purpose: a degenerate 0-median
 * run (nothing sampled) is not "very fast", it is "no data", and each caller
 * dims that case itself before ever asking for a tone. Folding the 0 case in
 * here would force one dim-vs-green policy on all three callers.
 */

/** A frame fits the 60fps budget when its merged median GPU time is under this. */
const FRAME_BUDGET_MS = 16.7;
/** Beyond ~30fps worth of GPU time the frame is clearly over budget — red. */
const HALF_BUDGET_MS = 33.3;

export function budgetTone(medianMs: number): 'green' | 'yellow' | 'red' {
  if (medianMs < FRAME_BUDGET_MS) return 'green';
  if (medianMs < HALF_BUDGET_MS) return 'yellow';
  return 'red';
}
