# `labels/vertex.wesl` mirrors `src/data/fonts.ts` with no parity test

**Area:** shaders / labels · **Readiness:** ready

`src/services/gpu/shaders/labels/vertex.wesl:27-32` hand-mirrors two atlas
constants from `src/data/fonts.ts`:

```
const ATLAS_EM_PX: f32 = 84.0;   // must match ATLAS_FONT_SIZE in fonts.ts
const DISTANCE_RANGE_PX: f32 = 32.0;   // must match DISTANCE_RANGE_PX in fonts.ts
```

against `fonts.ts:86` (`export const DISTANCE_RANGE_PX = 32`) and `:97`
(`export const ATLAS_FONT_SIZE = 84`). `fonts.ts`'s own doc comment
(`:72-77`) says the ratio between the two is load-bearing for the SDF's
encoded headroom — this is not a cosmetic pair.

Unlike the other TS↔WESL mirrors in the tree (see the companion "TS
constants injectable into WESL" backlog entry), this one has no guard:
`tests/data/fonts.test.ts` only restates the TS values
(`expect(ATLAS_FONT_SIZE).toBe(84)`) and never opens the `.wesl` file. A
mirror with no parity test looks identical to one with a parity test until
someone changes one side and the render silently goes stale (banded SDF
edges, clamped tails) with every test green.

## Fix

Add a parity test following the existing idiom (`readWeslConst`-style regex
match against the `.wesl` literal, asserted equal to the TS export) —
`tests/services/gpu/shaders/constants.parity.test.ts` and its five sibling
suites are the pattern to extend, or a new small suite for the labels
family. If the constants-injection backlog entry above lands a shared-module
or codegen mechanism first, prefer that over a sixth parity suite.
