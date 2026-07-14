# Repo-wide `degToRad`/`addVec3` migration + `data/<domain>/palette.ts` convention

`deferred` · split out of the `data/bodies/` cleanup (grill session
`docs/grill-sessions/data-bodies-cleanup-2026-07-14.md`, Q1 ring C + Q3). The
cleanup PR created `utils/math/degToRad.ts`, `utils/math/addVec3.ts`, and
`data/bodies/palette.ts` but deliberately migrated only the `data/bodies/`
consumers to keep its diff reviewable. This item is the opportunistic sweep of
the rest.

## Part 1 — inline `Math.PI / 180` sites → `degToRad`

Sites inlining the conversion as of 2026-07-14 (grep `Math.PI / 180` /
`(deg * Math.PI) / 180`):

- `src/utils/math/raDecDistToCartesian.ts:35-36`
- `src/utils/math/raDecDistToEqCart.ts`
- `src/utils/math/eqRaDecToUnitCart.ts`
- `src/utils/math/galacticToCartesian.ts`
- `src/services/engine/camera/cameraFraming.ts:36` (`DEFAULT_FOV_Y_RAD`)

Each is a one-line idiom that isn't lying to anyone — migrate when the file is
next touched, or in one small mechanical PR. Same for any component-wise vec3
adds outside `data/bodies/` that `addVec3` now covers.

## Part 2 — `data/<domain>/palette.ts` convention audit

The bodies cleanup established `data/bodies/palette.ts` as the one home for a
domain's named colour constants. User-proposed convention: other data folders
should follow. Candidates found by grep (colour/RGB/tint constants):

- `data/volume/scalarFieldPalettes.ts` — already the palette file; possibly
  rename to `data/volume/palette.ts` for uniformity (check consumers).
- `data/structure/categoryDisplayInfo.ts` — carries per-category display
  colours; decide whether colour splits out or display-info stays cohesive.
- `data/milkyWay/galacticCenter.ts` — inline colour constants.
- `data/sources/*.ts` — per-source colours; likely stay per-row (analogous to
  the albedo decision — per-entity values, not shared palettes).

The audit should apply the Q3 rule from the grill session: _shared, named_
palettes get the palette file; per-entity one-off values stay inline with
their rows.
