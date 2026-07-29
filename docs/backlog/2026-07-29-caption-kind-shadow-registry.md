# `CaptionKind` is a hand-maintained shadow of the label-bearing registry

The NEAR0 caption path keys everything on `CaptionKind` — `'star' | 'sun' | 'earth' |
'planet' | 'constellation'`. Those are the same near-field sources the
`SOURCE_REGISTRY` now owns as `bearsLabel: true` rows with a `labelLayer`. Two
vocabularies for one fact, one of them maintained by hand.

Four per-caption decisions are dispatched at four separate sites:

| Fact                     | Where it is decided                                   |
| ------------------------ | ----------------------------------------------------- |
| label gate               | `labelGateFor` — a switch in `foregroundLabelsLayer`   |
| subject-visibility gate  | inline `starMapEnabled` / `sunVisible` conjunctions    |
| fade band + scale units  | a 4-way ternary selecting `SCALE_FADE_BANDS`           |
| declutter tier           | `CAPTION_PRIORITY` — **already a total table**         |

`CAPTION_PRIORITY` is the model: a `satisfies Record<CaptionKind, number>` table with
no branch reading `kind === 'sun'`. Its three siblings stayed as branches beside it.

## The live trap this closes

`labelGateFor` handles `case 'constellation'`. The band-selection ternary does **not**
— constellation captions fall through into the `'star'` arm, which is gated on
`starMapEnabled` and paced by the pc-scale `starCaption` band.

Unreachable today, because constellation captions are appended separately via
`constellationCaptionsFor` and never travel through `sceneBodyLabels`. But it is a
real fall-through waiting for the day those paths merge, and it is exactly the class
of bug the table form makes impossible: a `Record<CaptionKind, …>` cannot silently
omit a kind.

This is also why the `SCALE_FADE_BANDS` ternary should not be fixed on its own. It is
a symptom. Converting just that one leaves three dispatch sites where there should be
one, and leaves `CaptionKind` still shadowing the registry.

## Shape

One row per caption kind carrying its band, its units, its priority, and its gate —
derived from the registry where the kind corresponds to a `bearsLabel` row, so adding
a label-bearing near-field source cannot leave a caption half-configured. The gate
column is the interesting one: it is currently the most entangled, since the
subject-visibility conjunctions differ per kind for real reasons (the star map has a
cluster master; the Sun has its own row; Earth and the planets have neither).
