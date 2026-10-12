# Unify thumbnail lookups on one resolver

`needs-verification` — written 2026-10-11, revised after #882.

## The problem

Structure shots now live in `public/images/structures/` and resolve through
`structureShotUrl(id)` (featured structures only; the structure card uses it).
`focusShotUrl` (`src/utils/palette/focusShotUrl.ts`) still serves the black-hole
card and goes through the featured cards, and three sites still build the path
with `SHOT_CARD_IDS` + `cardShotUrl(focusId)`: the palette's result rows
(`shotOrGlyph` in `paletteRows.tsx`), `BodyDetailCard` and `StarDetailCard`.

## To verify first

Search a structure (for example "Virgo") in the command palette and check
whether its row shows a thumbnail or a broken image / glyph; it may still
resolve through the old featured-card path.

## Then

Pick one resolver per id family, move the palette rows onto it, and delete
`SHOT_CARD_IDS` and its data file once nothing reads it.
