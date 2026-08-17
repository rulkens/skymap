# `CaptionKind` is a hand-maintained shadow of the label-bearing registry

The NEAR0 caption path keys everything on `CaptionKind` — `'sun' | 'earth' | 'planet' |
'star' | 'constellation'`. Those near-field sources are also rows in
`SOURCE_REGISTRY`, most with `bearsLabel: true`. Two vocabularies for one fact, one of
them (`CaptionKind`, in `captionPriority.ts`) maintained by hand.

## What's already been consolidated

Three of the original four per-caption dispatch sites have merged into
`captionFadeRules.ts`'s `CAPTION_FADE_RULES` — a `satisfies Record<CaptionKind,
CaptionFadeRule>` table with one row per kind carrying:

- `labelEnabled` (was: `labelGateFor`, a `switch` in `foregroundLabelsLayer`)
- `subjectVisible` (was: inline `starMapEnabled` / `sunVisible` conjunctions)
- `fadeTarget` (was: a 4-way ternary selecting `SCALE_FADE_BANDS`, keyed per-kind on
  the right distance units)

`foregroundLabelsLayer.draw` now reduces to `CAPTION_FADE_RULES[label.kind]` plus
applying the two gates (`foregroundLabelsLayer.ts:501-505`). None of `labelGateFor`,
`starMapEnabled`, or `sunVisible` exist in the tree anymore — confirmed by search, only
the historical description above still names them.

This also closes the live trap the original write-up flagged: the band-selection
ternary used to fall through `'constellation'` into the `'star'` arm (unreachable in
practice, but a real hazard once the constellation and scene-body caption paths
merge). `CAPTION_FADE_RULES` is `satisfies`-total over `CaptionKind`, so `constellation`
now has its own explicit row (`captionFadeRules.ts:128-132`, `PRODUCER_SUPPLIED` target)
and the fall-through can't recur — the table shape makes it a compile error to omit a
kind, not just a convention to remember.

`CAPTION_PRIORITY` (declutter tier, in `captionPriority.ts`) was already the model
table before this work and is unchanged — it stayed its own sibling table rather than
merging into `CAPTION_FADE_RULES`'s rows, which is fine: it's a second total `Record`
over the same key, not a fourth dispatch branch.

## What's left

The one thing the title actually names — `CaptionKind` itself — is still a hand-typed
union (`captionPriority.ts:38`), not derived from `SOURCE_REGISTRY`. Nothing consumes
the registry to produce or check it.

This is smaller than it looks, though: `CaptionKind` was never a 1:1 shadow of
`bearsLabel` rows to begin with, and still isn't now that the fade-rule consolidation
is done. `constellation` carries a `CaptionKind` but its source row
(`data/sources/constellations.ts`) is `bearsLabel: false`; conversely `cluster`,
`supercluster`, `void`, `group`, `milky-way`, and `famous-galaxy` are all
`bearsLabel: true` but have no `CaptionKind` — their captions ride the COSMO
`labelsLayer` / structure-label path entirely, a different pipeline from the NEAR0
scene-body captions this file's tables drive. `CaptionKind` is specifically "the
kinds of the seeded near-field bodies with their own foreground caption pipeline," a
narrower and differently-shaped set than "registry rows with `bearsLabel: true`" — the
registry has no flag today that picks out exactly that subset. Deriving `CaptionKind`
from the registry would need that flag added first, not just a mechanical `.filter()`.

## Is it still worth doing at this size

As a four-dispatch-sites problem, no — three sites are gone and the fourth
(`CAPTION_PRIORITY`) was never actually broken. As a "derive one hand-typed union from
the registry" problem, maybe, but it's no longer closing a live bug (the
`satisfies Record` tables already make omitting a `CaptionKind` a compile error
wherever it's consumed) — it would be a naming/provenance cleanup, and it first needs
a decision about what registry-level concept ("has its own NEAR0 caption row") the
derivation would key on. That's a smaller, `needs-design`-shaped question than the
original four-site framing, and arguably lower priority now that the bug it was
guarding against is closed by construction.
