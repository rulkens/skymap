/**
 * TIMING_SLOTS — the GPU-timing slots this tool bills, in frame-encode order:
 * the HUD's row order, and the order `gpuTimingService` allocates query-set
 * index pairs in. This list is the tool's ONE account of the pass chain; a
 * second copy anywhere else would be the copy that drifts.
 *
 * A timestamp pair can only bracket a whole pass, so the split between slots
 * is the split between passes — not a choice. A slot whose pass didn't run
 * leaves its `descriptorFor` unconsumed and the service drops the row, which
 * is why the conditional slots need no other bookkeeping.
 */
export const TIMING_SLOTS: readonly string[] = [
  // The additive SPRITE pass alone: the reduced-resolution `aggregateTex` is
  // its own attachment and therefore its own pass. This is the fill-bound half
  // and the number the divisor / sprite-size knobs move, so having it isolated
  // is most of the point of the split.
  'stars',
  // The dust-column splat — one quad per Gaussian dust component — into its
  // OWN reduced-resolution `dustMapTex`, at `dustDivisor` rather than the
  // field's. See `drawFrame`'s three-disjunct gate for when it is encoded.
  'dustMap',
  // The analytic Gaussian-mixture splat into `fieldTex` alone. The JWST
  // dustPresent pass runs ADDITIONALLY, into its own `dustViewTex`, and
  // carries no `timestampWrites`: two passes cannot share one timestamp pair
  // in a frame, and a presentation pass nobody bills separately from the field
  // it runs alongside does not earn a slot of its own.
  'field',
  // The HII tier's own splat — the same `splatPipe`, a different bind group
  // and target (`hiiTex`, `render.hiiDivisor`). See `hiiTex`'s declaration
  // comment for why it cannot share `'field'`'s slot or target.
  'hii',
  // Per-tier HII rows, consumed INSTEAD of `'hii'` while the HUD is live:
  // `drawFrame` then encodes one sub-pass per non-empty `model.hiiSegments`
  // entry EXCEPT `hii:dig` (own timestamp pair per pass — see this file's own
  // header) rather than the single merged draw `'hii'` bills off the timing
  // path. Off the timing path `'hii'` alone still covers shells/young/extras,
  // so these three never consume a slot there. `'hii:extras'` is every
  // background extra's HII contribution lumped into one row — see
  // `createGalaxyModel.ts`'s `repackHiiComponents` for why extras can't split
  // further (their own shell/DIG/young spans interleave across extras, so
  // per-extra labels would stop being HUD-short and stop being contiguous).
  'hii:shells',
  'hii:young',
  'hii:extras',
  // The DIG (diffuse ionized gas) veil's OWN pass into its OWN target
  // (`digTex`, `render.digDivisor`) — split off the HII tier entirely, not a
  // fifth per-tier row: DIG always draws as one pass regardless of whether
  // the HUD split is active, so this slot is consumed unconditionally
  // whenever the tier has any DIG content (see `drawFrame`), unlike
  // `'hii:shells'`/`'hii:young'`/`'hii:extras'` above.
  'dig',
  // The full-res HDR pass: the aggregate's additive upsample, the field's and
  // the HII tier's, the dust billboards, and each live diagnostic overlay —
  // all summed additively rather than any one replacing the others. They share
  // one attachment and so share a pass; separating them would mean reopening
  // the HDR target with `loadOp: 'load'`, which on a tile-based GPU is a full
  // tile store plus reload — more cost than the measurement is worth.
  'scene',
  // The whole pyramid as ONE span (begin on the bright pass, end on the fold),
  // which is exactly how the app's frame program bills it (`frameProgram.ts`'s
  // `'bloom'` step and `runBloom`). Matching keeps a number read here
  // comparable to the same number read in the app.
  'bloom',
  'composite',
  // Tool-only, and only on frames the grade trailer actually ran.
  'grade',
];
