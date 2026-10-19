# ADR 0013 — Source Identity Is a String Id; Pick Codes and Mask Bits Are Minted Per Use

- **Status:** Proposed
- **Date:** 2026-10-19
- **Decision-makers:** Alexander Rulkens (with Claude)
- **Tags:** data, sources, picking, selection, registry
- **Supersedes:** —
- **Superseded by:** —
- **Related:** [ADR 0011 — Engine composition rows](0011-engine-composition-bundle-rows.md) ·
  audit `docs/audits/2026-10-16-architecture-weak-points.md` (pattern C, pipeline item 4) ·
  backlog `docs/backlog/2026-10-19-source-identity-split.md`

## Context

`Source` (`src/data/source.ts`) is a numeric enum decided on 2026-05-03 for
three catalogs. It now has 37 slots and does four jobs: the `SOURCE_REGISTRY`
key, the 6-bit pick code packed above a 26-bit local index
(`selectionEncoding.ts`), the bit position of the 32-bit visibility mask
(`maskWith.ts:10`, `maskHas.ts:15`), and the arm of the exhaustive
`galaxyType` switch.

Three facts make the shape wrong at today's size. The mask shifts by the raw
code and JavaScript shifts are modulo 32, so code 36 already aliases bit 4 and
the next galaxy survey at 37 aliases bit 5. Thirteen of the 37 slots are
retired or registry-only rows that are never pickable, yet they spend the
pick field's 63 usable codes. The 26-bit local index caps a source at 67M
rows, which the REGALADE compilation (71.5M) exceeds, and nothing asserts the
width at pack time. The enum's own docblock claimed the codes are persisted in
`.bin` files; the SKMP record layout has no source field, so the "append-only
forever" cost it described was not real.

## Decision

**A source's identity is a string `SourceId`. Numeric codes are minted per
use from the composed registry, only for the rows that use them, and their
widths are asserted.**

1. `SourceId` is the registry key, the asset-slot key, the settings item key
   and the deep-link token. It never appears in a `.bin` or a pick texture.
2. The pick program assigns a dense `pickCode` to the rows that declare a
   `drawPick`, in composition order, at boot. The `SelectionKindRow` owns the
   local-index width it needs; `packSelection` asserts both widths and throws.
3. The galaxy-catalog visibility mask is indexed by the catalog's ordinal in
   `GALAXY_CATALOG_IDS`, not by any global code. A `maskWith` call with an
   out-of-range ordinal throws.
4. The `galaxyType` switch becomes a registry field (`galaxyType?` on the
   row), so a new source is one row and no switch arm.
5. Deep links carry string ids today, so no link migration is needed. Saved
   selections do not persist codes.

## Alternatives considered

**Widen the pick field to 8 bits and keep the enum.** Buys time, keeps all
four jobs on one number, and leaves the mask wrap in place.

**Keep the numeric enum but index the mask by ordinal.** Fixes the live hazard
only; the pick budget and the switch arms stay per-source hand edits.

## Consequences

- Positive: a new survey is one registry row; no shared budget is spent by
  rows that do not pick; the hazard class "silent aliasing" is gone.
- Negative: one migration PR touches every reader of `Source` (five sites
  listed in the backlog item); the pick shader's packed word changes shape.
- Neutral: `Source` stays as a deprecated alias during the migration and is
  deleted at its end.
