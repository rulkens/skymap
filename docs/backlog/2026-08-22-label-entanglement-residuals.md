# Label-entanglement residuals from the rung-8 radar pass

Surfaced by an `entanglement-radar` review of `refactor/label-unification`
(rung 8, label/marker-mechanism unification). Deferred rather than folded
into the rung's own PRs — none block the shipped work, each is independently
pickable.

## What it is

Three findings, unrelated to each other beyond sharing the label/marker
surface:

1. **Structure fade curve duplicated between marker and label producers.**
   `produceStructureMarkers.ts:97-119` and `produceStructureLabels.ts:138-174`
   each hand-roll the same pair of smoothstep curves — close-approach
   fade-out past `style.markerMaxApparentRadiusPx` and far-distance fade-in
   below `style.markerMinApparentRadiusPx` — against the same
   `STRUCTURE_MARKER_STYLES` thresholds. The two copies are linked only by a
   comment ("Mirrors the smoothstep `produceStructureMarkers` uses so label +
   ring disappear together") — a promise the type system does nothing to
   keep.
2. **`signatureOf` hand-picks which `Label2D` fields matter for re-upload.**
   `label2DDirector.ts`'s `signatureOf` (359-414) gates GPU re-upload on a
   hand-maintained subset of fields — `id`, `fadeAlpha`, `worldPos`,
   `leader.toWorld`. Which fields actually vary per `id` is decided
   independently in each producer file, which `signatureOf` never sees.
   The function's own comment documents the resulting hole: a producer that
   mutates `text` at a fixed `id` would not trigger re-upload (stale GPU
   buffer). No current producer does this, but nothing stops a future one
   from reintroducing the failure the comment already anticipates.
3. **`FOREGROUND_LABEL_CAPACITY` presumes a closed producer set.**
   `sceneBodyLabels.ts:68-69` computes the buffer capacity as
   `SCENE_BODIES.length + CONSTELLATION_COUNT`, rounded up to the next power
   of two — a formula that is only correct because exactly two producers
   (`sceneBodyCaptions`, `constellationCaptions`) are registered on
   `foregroundLabelDirector` in `engine.ts`'s registration block. The two
   facts — the capacity formula and the registered-producer set — live in
   different files with nothing tying them together.
   `labelRenderer.ts`'s `setLabels` (487) clamps silently
   (`Math.min(labels.length, maxLabels)`): a third foreground producer would
   drop captions with no error, no warning, just missing text.

## Why it matters

None are correctness bugs today — all three pairs currently agree. The risk
is drift under a future edit that touches only one side:

1. A fade-curve tweak (a new falloff shape, a threshold-comparison fix)
   applied to the marker producer and not the label producer — or vice
   versa — desyncs ring and label fade, and nothing would catch it; the two
   curves have no shared type or test forcing them to move together.
2. A producer that starts varying a field `signatureOf` doesn't key on
   silently ships a stale GPU buffer — the exact bug class the function's
   own comment already flags as a known gap, just not yet triggered.
3. A third `foregroundLabelDirector.registerProducer` call — plausible the
   next time a caption-like label category is added — silently truncates
   whichever producer's labels land last in the merge order, with no error
   surfaced anywhere.

## Approach

Each is independently pickable; no shared design decision ties them
together:

1. Extract one `structureApparentRadiusFade(apparentRadiusPx, style)`
   returning the combined close/far fade factor; both
   `produceStructureMarkers` and `produceStructureLabels` call it instead of
   inlining the two smoothstep branches.
2. Replace the hand-maintained field list with either a structural hash of
   the whole `Label2D` (minus a documented, deliberately-excluded field list
   — e.g. `color`, per the existing comment) or a `satisfies`-checked key
   list derived from the `Label2D` type itself, so a new field forces an
   explicit include/exclude decision at compile time rather than silently
   falling outside the signature.
3. Derive `FOREGROUND_LABEL_CAPACITY` from the registered-producer set
   directly (each producer reports its own max label count, summed and
   rounded up), or add an assertion — one capacity term per registered
   producer, checked at startup — so a new `registerProducer` call that
   forgets the capacity side fails loudly instead of dropping labels.
