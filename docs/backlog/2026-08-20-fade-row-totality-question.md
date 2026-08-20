# Decide whether bundle-declared fade rows still force dead union-totality placeholders

Surfaced by `docs/research/engine/current-contracts-map.md` §8 "Gaps the
spec does not cover" item 5 (`:273`): "No-consumer fade rows — when fades
become bundle-declared, decide whether key totality still forces the dead
rows." `ORPHAN` in the 2026-08-20 carry-forward audit: a distinct
forward-looking question about the not-yet-built bundle-declared fades
mechanism, not the same as rung 7's near-term dead-handle cleanup (a
different, currently-live finding — see below), and not named in
`decisions.md` #17's carried-forward list.

## What it is

Today, `FadeLayer` rows are a flat manifest and `FadeId`/
`VisibilityLayerKey` are type-level unions that must stay total — every
member of the union needs a row, even ones with no live consumer. The
current-contracts-map's loose-spots table (`:189`) already names the present
cost of that totality requirement. Rung 7 corrected the count and ruled on
every member (`decisions.md` #18): the no-consumer set is 5 —
`proceduralDisks`, `texturedDisks`, `scaleBar`, `starCatalogLabel`,
`bodyLabel` (`structureRing` was listed in error; `scaleBar` was missing).
The three registration-only rows are ACCEPTED (#18 D13) and the two label
rows are rung 8's wire (#18 D12), which discharged the separate cleanup item
that used to be tracked here.

**This item is not that cleanup.** It's the forward-looking design question
for after fades become bundle-declared: decisions.md #7 settles that
"bundles declare their `FADE_LAYERS` manifest rows (`fades?: readonly
FadeLayer[]`); the wiring manifest becomes a concatenation over bundles." In
that future world, does the same totality problem persist — does a bundle
still have to declare a placeholder row for every union member it could
theoretically need, even ones it never actually uses — or does
bundle-declared fades let dead rows simply not exist (a bundle that doesn't
need a fade row for a given key just doesn't declare one, and the union
narrows to "keys some bundle declares" rather than "all keys that could ever
exist")?

## Why it matters

Design question, not a bug: nothing is broken today. But the answer shapes
how the bundle-declared fades mechanism should be built — get it wrong and
either (a) dead-row totality artifacts persist under the new mechanism too
(no improvement over today), or (b) the union stops being exhaustively
checkable at compile time (a real regression: `FadeId`/`VisibilityLayerKey`
staying type-level and total today is what currently catches an unregistered
key at compile time rather than at runtime).

## Approach

This is downstream of decisions.md #7's bundle-declared fades mechanism,
which itself is downstream of the umbrella `SubsystemBundle` reassessment
(deferred per decisions.md #9/#17 until rungs 7 and 8 land). Do not attempt
to answer this question in isolation from that reassessment — the shape of
`fades?: readonly FadeLayer[]` on a bundle needs to exist first before "does
totality still apply" has a concrete mechanism to be asked about. When the
umbrella reassessment happens, fold this question in as one of the design
choices for the bundle-declared fades sub-contract, alongside deciding
whether `FADE_ROW`/`VISIBILITY_ACTION_ROW`'s hand-maintained inverse-map
derivation (rung 7's explicit charter, decisions.md #9) shares an answer
with it — both are "how total does a bundle-declared union need to stay"
questions about the same fades machinery.
