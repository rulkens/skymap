# `encodeBloomPyramid` (tool) hand-mirrors app `runBloom` — de-duplicate or generate

Surfaced by `docs/research/engine/decisions.md`'s "Spun off to backlog" list
("Tool bloom-mirror deletion (`encodeBloomPyramid` consuming app `runBloom`)
— natural near P3 but scope-creep risk") and
[`field-seam-map.md`](../research/engine/field-seam-map.md):89 (§3, tool↔app
file-mapping table: "`post/encodeBloomPyramid.ts` | hand-mirrors app's
`runBloom` — manually-kept-in-sync duplicate"). `ORPHAN` in the 2026-08-20
carry-forward audit — no backlog file exists, and it was explicitly scoped
OUT of Track B (the galaxy-generator field-renderer effort's P3 phase) as
"scope-creep risk," with nowhere else to land.

## What it is

`tools/galaxy-renderer/src/engine/post/encodeBloomPyramid.ts` (the
`galaxy-renderer` dev tool's bloom pass encoder) hand-mirrors the app's
`src/services/engine/frame/runBloom.ts` pass order. The two are not
generated from a shared source or imported from one another — they are kept
in sync by whoever last edited either one remembering to update the other.

## Why it matters

Cleanup / drift-risk: bloom pass ordering is exactly the kind of thing that
is easy to change in one place (say, tuning the app's bloom mip count or
pyramid levels — see the
[bloom mip-count perf](2026-07-21-bloom-mip-count-perf.md) backlog item,
which is actively investigating that exact knob) and forget to mirror into
the tool, or vice versa. A silent divergence wouldn't fail a build or test —
the tool and app would simply produce different-looking bloom with no
signal that they've drifted apart, undermining the tool's value as a
visual-parity dev environment for the renderer it's meant to prototype
against.

## Approach

No design done — decisions.md explicitly flagged this as scope-creep risk
for the Track B effort it was surfaced during, not as something to fold in
opportunistically. Two directions, per the backlog note's own framing
("de-duplicate or generate"):

1. **De-duplicate**: extract the shared bloom-pass-order logic into one
   function both the app's `runBloom.ts` and the tool's
   `encodeBloomPyramid.ts` call, parameterized over whatever legitimately
   differs between the two contexts (target formats, mip counts, etc.).
2. **Generate**: keep the two files separate but derive one from the other
   at build time, or add a parity test that fails if the pass orders
   diverge (cheaper than full de-duplication if the two call sites'
   surrounding context makes a shared function awkward).

Whichever direction, treat this as a standalone pickup rather than riding
another effort's PR — the "scope-creep risk" framing at spin-off time was
specifically about NOT bundling it into other bloom-adjacent work already in
flight.
