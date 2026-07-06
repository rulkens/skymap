# Fade label reveals under the tour's focusedOnly mode

`deferred` · surfaced 2026-07-02 while live-tuning the grand tour's opening beats.

## Problem

`settings.labels.focusedOnly` (the tour's label-isolation mode) gates label
_emission_: each producer (`produceFamousLabels`, `produceStructureLabels`,
`produceMilkyWayLabel`) simply skips every row that is not the focused
subject. When focus changes — e.g. `approachM31`'s `focus(M31)` cue between
the aim and the fly — the old label vanishes and the new one appears on the
next frame. The pop is jarring in practice (confirmed watching beat 02: M31's
label snaps in the instant it centres).

## Why it pops

The fade registry (ADR 0001) fades _layers_, not individual labels. The
focusedOnly gate operates per-row inside a producer, below the layer
granularity, so no fade controller ever sees the transition. `fadeAlpha` on an
emitted label comes from the layer opacity × distance fade — both continuous —
but emission itself is a boolean cliff.

## Options sketched (not designed)

1. **Per-label alpha envelope in the producers** — track the focused id's
   change, ease a 0→1 alpha for the incoming label (and 1→0 for the outgoing
   one, which must keep emitting during its tail). Mirrors the
   `produceMilkyWayLabel` disabled-but-fading tail pattern, but needs a
   time-source + small state in what are today pure per-frame readers.
2. **Route through the fade registry** — give the focused label a transient
   fade handle keyed by selection ref. Fits ADR 0001's ownership story, but
   the registry is layer-keyed today; per-label handles are a new shape.
3. **Label-director crossfade** — if the declutter/label-director work lands
   (see 2026-06-29-label-declutter-toggle.md), a generic per-label
   appear/disappear envelope there would solve this and declutter flicker in
   one mechanism. Likely the right home; check that item first when picking
   this up.

## Pointers

- Gate sites: `src/services/engine/presentation/produceFamousLabels.ts`,
  `produceStructureLabels.ts`, `produceMilkyWayLabel.ts` (each has a
  focusedOnly early-out / `continue`).
- Mode + docs: `docs/tour/implementation-notes.md` (focusedOnly entry),
  `docs/animation/clip-primitives.md` (`setLabelsFocusedOnly`).
