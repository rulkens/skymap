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
  // Every `HII_TIERS` row's own splat — the same `splatPipe`, its own bind
  // group and its own target/divisor (`data/hiiTiers.ts`'s `HII_TIERS`,
  // `createGalaxyRenderTargets.ts`'s `allocateTier`). DIG was the first tier
  // to earn this split (small, bright shells collapsing under `fieldTex`'s
  // shared coarser texel and blooming into fireflies); shells and young stars
  // get the identical treatment now via the same table rather than a
  // hand-duplicated third/fourth copy. Each slot is consumed whenever
  // `drawFrame` finds that tier's span in `field.hiiSegments` nonempty,
  // billed unconditionally on content rather than behind a HUD-gated
  // toggle: every tier owns a private target, so billing it separately
  // costs nothing extra on any frame.
  'hii:shells',
  'hii:young',
  'hii:dig',
  // `hiiTex`'s own pass, which now draws ONLY background extras' whole HII
  // contribution lumped into one row — see `hiiSplat/extrasFragment.wesl`'s
  // header for why extras can't split into their own
  // shell/DIG/young tiers the way the central galaxy's components do (their
  // own spans interleave across extras, so per-extra labels would stop being
  // HUD-short and stop being contiguous). Same unconditional-on-content
  // billing as the three tiers above, off its own target.
  'hii:extras',
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
