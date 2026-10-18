# `RENDER_ORIGIN_MPC` doubles as the Sun's position

**Status:** ready (adjacent finding of the relativistic-voyage ground check, 2026-10-18)

## The problem

`RENDER_ORIGIN_MPC` (`src/data/renderOrigin.ts`) is the floating-origin anchor ADR 0010 names as the extension
point for a future moving origin. Six passes also hand it to `sunDirLocal` as the Sun's position:
`earthPass.ts:157`, `ringsPass.ts:155`, `surfaceTilesPass.ts:80`, `meshBodiesPass.ts:73-77`,
`atmosphereDrawList.ts:71`, `bodyGlintsPass.ts:207,374`. Two facts that happen to share a value today, `[0, 0, 0]`,
are braided: the day the origin moves, the Sun moves with it and every lit body is lit from the wrong side.

## The fix

A `SUN_POSITION_MPC` constant in `src/data/` (or the Sun's own body state, which already exists in
`deriveBodyStates`) at those six sites; `RENDER_ORIGIN_MPC` keeps only its origin readers
(`deriveSlabs`, `drawFlooredSpherePick`, `sceneBodyLabels`). Behaviour-neutral while both are `[0, 0, 0]`; a test
that the two constants are distinct symbols is not worth writing, a grep is the guard.
