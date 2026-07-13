# `data/bodies/` cleanup + reorg

`needs-design` · surfaced 2026-07-14 while landing zoom-to-earth plan 04 (conic
orbit trails). The folder grew fast — Earth/Jupiter/Moon → all 8 planets → 13
major moons + per-planet equatorial frames — and now carries duplicated helpers,
scattered palette constants, and files that mix a type, its table, and several
maker functions. This is a decomplection + one-symbol-per-file pass, not a
behaviour change.

## Current state (`file:line` evidence)

```
 42  src/data/bodies/eclipticBasis.ts
 65  src/data/bodies/orbitPlaneFrames.ts       planeFrameFromPole + 4 frame consts
 76  src/data/bodies/sceneOrbitConics.ts       parentWorldMpc + derived table
283  src/data/bodies/sceneBodies.ts            star/heliocentricPlanet/satelliteBody + elementsById + tables
395  src/data/bodies/orbitalElements.ts        satellite() maker + 21-row table + 13 colour consts
```

Concrete knots:

- **`DEG_TO_RAD` duplicated** — a `const DEG_TO_RAD = Math.PI / 180` in
  `orbitalElements.ts:73` AND `orbitPlaneFrames.ts:29`. Each has a docblock
  rationalising it as module-local; a second copy is the trigger to reconsider
  (a `src/utils/math/degToRad.ts`, or lean on an existing angle helper).
- **Maker functions inline with their tables** — `satellite()`
  (`orbitalElements.ts:106`), `heliocentricPlanet()` / `satelliteBody()` / `star()`
  and `elementsById()` (`sceneBodies.ts`) are row-constructors living in the same
  file as the data they build. Candidates to extract so the data files are data.
- **Colour palette constants scattered** — 13 `Vec3` trail tints
  (`orbitalElements.ts:71-87`) authored as loose `const`s at module top; a
  `bodyPalette.ts` (or per-body colour on a single body registry) would give one
  home.
- **Type + table + logic mixed** — `sceneOrbitConics.ts` holds a resolver
  (`parentWorldMpc`) + the derived table; per the one-symbol convention the pure
  helper wants its own `utils/` file with a focused test.
- **Styling / naming drift** — inconsistent grouping of frames vs elements vs
  bodies; a pass to confirm each `@types/scene/*` type has one file and each
  `utils/` extraction one function.

## Scope / approach (to be spec'd)

1. Extract shared pure helpers to `src/utils/` (`degToRad`, any vec3-add used at
   seed sites) — one function per file + focused test; delete the module-local
   copies.
2. Give the maker functions (`satellite`, `heliocentricPlanet`, `satelliteBody`,
   `star`, `elementsById`, `parentWorldMpc`) a home consistent with the
   one-symbol convention — decide util vs a small `bodies/makers/` grouping.
3. One home for the body/trail colour palette.
4. Confirm every `@types/scene/*` shape is one-type-per-file and the tables read
   as pure data.

Behaviour-preserving throughout — the full body/orbit test suite is the gate. No
`.bin` or format impact (this is scene-authored data, not catalog data).

## Why deferred, not done inline

Landed alongside the plan-04 feature work it would have ballooned that PR's diff
and mixed a reorg with a feature. Captured here to pick up as its own branch.
