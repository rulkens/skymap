# ADR 0016 — Body Content Rides Layer Rows; Core Runs on an Empty Body List

- **Status:** Accepted
- **Date:** 2026-11-24
- **Decision-makers:** Alexander Rulkens (with Claude)
- **Supersedes:** —
- **Superseded by:** —
- **Related:** [ADR 0013](0013-registries-built-from-layer-contributions.md) ·
  [body content out of core spec](../superpowers/specs/completed/2026-11-24-body-content-out-of-core-design.md) ·
  the registry ledger, `src/compositions/README.md` ·
  guard test `tests/compositions/emptyBodyRegistry.test.ts`

## Context

Layers contribute body rows, and `src/compositions/appBodies.ts` collects them into
`APP_BODY_REGISTRY` (ADR 0013). Core still held body content of its own beside that registry: an
ephemeris correction table keyed by body id, a barycentric pair naming Earth and the Moon, Sun,
famous-star and S-star tables built from generated star data, a hand list of shape-model moons,
and mesh asset rows it minted for every Layer. Always-loaded modules also named Earth: a
module-scope `SCENE_EARTH`, the go-home and URL home, the fly-to default body.

The galaxies-only spike of 2026-11-23 measured the cost. About 160 kB minified of body content
reached its build through core with no registry involved, five tables threw at import without an
Earth, Moon or Sun row, and stubbing the star tables zeroed the survey's fade edge, so no galaxy
drew at 300 Mpc. Its build was 279 kB gzip against 315 kB for the app's registries.

## Decision

**Core keeps the mechanisms, and they run on an empty body list; body content is a value on a
Layer's body row. Core may not name a body at load.**

- **Mechanisms stay in core:** the Kepler solve, the body-state map (`deriveBodyStates`), the four
  camera arms, the mesh, orbit-trail and body-pick renderers, the time clock, the occluders.
  Moving them needs a ruling on Layers reading Layers, which ADR 0013 left open.
- **Content is on rows.** A Layer imports its generated data and attaches it to its own rows; core
  folds `APP_BODY_REGISTRY` and never keys a table by body id. A singular lookup becomes a list
  (zero or one Earth row), a required field, or the composition's home (`APP_HOME`).
- **The contract grew, each step with the owner's yes:** `BodyPosition` gained an `anchor` arm and
  `correction?` / `pair?` on orbits (the ephemeris and star data ride the rows); `LayerBody` gained
  `shapeModel?`; `LayerCoreDeps` gained `meshBodies`, so the four mesh Layers return their own mesh
  asset rows. `ReconcileEffects` and `SagaContext` did not change. On the owner's ruling the clip
  table also moved to the composition first (`src/compositions/appClips.ts`, `ClipId` derived by
  ADR 0013's rule), so `rootSaga` loads with no bodies.
- **No rows is a defined value.** With every region extent 0, the survey's foreground gate falls
  back to `FOREGROUND_FALLBACK_DISTANCE_MPC` (0.23 Mpc, the app's value). With no Sun the core
  `solarSystem` sky capture never bakes.
- **A Layer's own registries may name bodies.** Composing the Layer brings its bodies with it. The
  body Layer's settings slices read its Earth row at import, which is Layer content, not core.
- **The guard test enforces it.** `tests/compositions/emptyBodyRegistry.test.ts` mocks `appBodies`
  to no rows and gives each registry that states body content (`appHome`, `appVisibility`,
  `appTours`, `appClips`, `appSettingsSlices`) a no-content stand-in, then imports the engine entry,
  `rootSaga` and `rootReducer`. It asserts nothing throws and `deriveBodyStates` returns only
  `galactic-centre`.

**Not decided here.** Registries are still chosen by import of `src/compositions/app*.ts`, so a
second composition today means swapping those files at build time; registry injection is future
work (spec §8). Also out: an arm registry, moving any renderer, committing a galaxies-only
composition (composition spec §7), and `trajectoryRegistry` as a hidden solver input.

## Consequences

### Positive

- Measured 2026-11-24: a galaxies-only measuring build with every `compositions/app*.ts` swapped
  for a no-content stand-in is 211 kB gzip and loads with no stubs of core modules; the same build
  shape with the app's registries is 305 kB. It contains none of the five sources of spec §1, and
  at `#pose=a,0,0,0,0.5,0.3,300,0` it draws the same survey as the baseline (804,476 galaxies).
- A new body is a row in its Layer; no core table changes.
- The app is unchanged: same registries, same values, no per-frame code changed, perf within noise.

### Negative

- The contract carries a new position arm, three optional fields and one more core dependency.
- `SCENE_EARTH` still throws with no Earth row. Only Layers may read it, and only the guard test
  stops a core module from doing so.
- Every stand-in in the guard test is a hole in it; a new registry that states body content must
  be added there, or the test stops covering what imports it.

### Neutral / forward-looking

- The guard test's mock list is the list of registries injection will have to carry.

## References

- ADR 0013: registries built from Layer contributions, and the open Layer-to-Layer ruling.
- Spec `2026-11-24-body-content-out-of-core-design.md` §1 (the spike's numbers), §2 (rulings), §8.
- PRs #1155 (core stops naming Earth), #1157 (orbit and star rows), #1162 (mesh rows), #1164
  (clips), and PR D (fade-edge fallback, `APP_HOME`, guard test).
