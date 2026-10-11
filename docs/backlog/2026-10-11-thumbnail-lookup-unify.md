# Unify thumbnail lookups on `focusShotUrl`

`needs-verification` — written 2026-10-11, out of the phone-HUD thumbnail work.

## The problem

Shots are filed by featured-card id, which differs from the focus id for
structures (card `cluster-virgo-m87`, focus `galaxy-cluster-virgo-m87`).
`src/utils/palette/focusShotUrl.ts` resolves a focus id to its shot through
the featured cards. Three other sites still go through `SHOT_CARD_IDS`
(`src/data/palette/shotCardIds.ts`) and `cardShotUrl(focusId)`: the palette's
result rows (`shotOrGlyph` in `paletteRows.tsx`), `BodyDetailCard` and
`StarDetailCard`.

## To verify first

In a browser, search a structure (for example "Virgo") in the command palette
and check whether its row shows a thumbnail or a broken image / glyph. Reading
the code, the row appears to build the path from the focus id, which would
miss the file; this has not been confirmed.

## Then

Move the palette rows, `BodyDetailCard` and `StarDetailCard` to
`focusShotUrl`, and delete `SHOT_CARD_IDS` and its data file once nothing reads it.
