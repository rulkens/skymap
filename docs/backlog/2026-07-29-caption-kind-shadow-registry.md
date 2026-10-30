# `CaptionKind` is a hand-maintained shadow of the label-bearing registry

The NEAR0 caption path keys everything on `CaptionKind` — `'sun' | 'earth' | 'planet' |
'star' | 'constellation'`. Those near-field sources are also rows in
`SOURCE_REGISTRY`, most with `bearsLabel: true`. Two vocabularies for one fact, one of
them (`CaptionKind`, in `captionPriority.ts`) maintained by hand.

## What's already been consolidated

The per-caption dispatch sites are gone. Each caption's switch, fade and distance
band are its own Layer's `visibility.ts` entry, handed to the producer as one value;
the star map's per-star fade rides each caption's `revealBand`. `CaptionKind` now
keys only `CAPTION_PRIORITY` (declutter tier, in `captionPriority.ts`), a
`satisfies`-total `Record` over the union.

## What's left

The one thing the title actually names — `CaptionKind` itself — is still a hand-typed
union (`captionPriority.ts:38`), not derived from `SOURCE_REGISTRY`. Nothing consumes
the registry to produce or check it.

This is smaller than it looks, though: `CaptionKind` was never a 1:1 shadow of
`bearsLabel` rows to begin with, and still isn't now that the fade-rule consolidation
is done. `constellation` carries a `CaptionKind` but its source row
(`src/layers/constellations/sources/constellations.ts`) is `bearsLabel: false`; conversely `cluster`,
`supercluster`, `void`, `group`, `milky-way`, and `famous-galaxy` are all
`bearsLabel: true` but have no `CaptionKind` — their captions ride the COSMO
`labelsPass` / structure-label path entirely, a different pipeline from the NEAR0
scene-body captions this file's tables drive. `CaptionKind` is specifically "the
kinds of the seeded near-field bodies with their own foreground caption pipeline," a
narrower and differently-shaped set than "registry rows with `bearsLabel: true`" — the
registry has no flag today that picks out exactly that subset. Deriving `CaptionKind`
from the registry would need that flag added first, not just a mechanical `.filter()`.

## Is it still worth doing at this size

As a four-dispatch-sites problem, no — three sites are gone and the fourth
(`CAPTION_PRIORITY`) was never actually broken. As a "derive one hand-typed union from
the registry" problem, maybe, but it's no longer closing a live bug (the
`satisfies Record` table already makes omitting a `CaptionKind` a compile error
where it's consumed) — it would be a naming/provenance cleanup, and it first needs
a decision about what registry-level concept ("has its own NEAR0 caption row") the
derivation would key on. That's a smaller, `needs-design`-shaped question than the
original four-site framing, and arguably lower priority now that the bug it was
guarding against is closed by construction.
