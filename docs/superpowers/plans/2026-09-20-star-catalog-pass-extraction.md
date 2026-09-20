# starCatalogPass extraction — prep for the starCatalog Layer

Ground prep for the `starCatalog` Layer (spec
`docs/superpowers/specs/2026-09-09-layer-composition-design.md` §6.4, §10e). That
Layer PR carries the god-layer split; this plan does the mechanical half first so
the Layer PR is a folder move plus a contract, not surgery on a 1061-line file.

`src/services/engine/frame/passes/starCatalogPass.ts` is 1061 lines with 26
top-level declarations — the worst row in the frame-file-purity ratchet (next
worst: `slabs` at 18). It braids five separable things: the visibility gate two
sibling passes import directly, the per-frame octree cut, the per-node LOD fade
state, the SoA draw streams, and the two draw emitters.

No behaviour change except Task 1's cull-slack fix, which is called out there and
lands test-first.

## Out of scope (deferred to the Layer PR)

- `computeStarCut(state, ctx, advanceFades: boolean)` — the boolean flag that
  switches the function between pure and mutating. Un-braiding it is design work
  (spec §6.4's "stream SoA crossfade bookkeeping" strand), not mechanical prep.
- Moving anything into `src/layers/starCatalog/`. Destinations here are chosen so
  the Layer PR moves whole folders.

## Task 1 — Dead code, constants, and the cull-slack fix

The only behaviour change in this plan. `lib/starPhotometry.wesl` states its
contract explicitly — _"Reference star-dot size in px — mirrors
DEFAULT_STAR_SIZE_PX (src/data/defaults.ts; consume, never diverge). Dividing the
user's `sizePx` slider by it makes the DEFAULT setting the identity (`sizeScale ==
1`)"_ — but the values diverged: `STAR_SIZE_REF_PX = 2.5` against
`DEFAULT_STAR_SIZE_PX = 4.7`. At the default slider the shader's `sizeScale` is
1.88, not 1, and three CPU sites divide by 4.7 where the shader divides by 2.5,
computing cull slack **1.88× smaller than the footprint the shader rasterises**.
Each of those sites carries a comment promising the opposite ("a false cull would
wink a visible star out", "forbidden").

The WESL value is NOT the thing to change: at 2.5 the shipped starfield draws
1.88× the reference and that is the tuned look. The TS twin is what is missing.

- [ ] Failing test first: at default settings, the CPU leaf cull slack covers the
      shader's drawn footprint (`STAR_GLOW_MIN_PX × sizePx / STAR_SIZE_REF_PX`).
- [ ] `src/data/starCullSlack.ts` — the three px constants, WESL twins all:

```ts
/** Reference star-dot size in px — the `sizePx` divisor. WESL twin. */
export const STAR_SIZE_REF_PX = 2.5;
/** Legibility floor for a point source in px, at the reference size. WESL twin. */
export const STAR_GLOW_MIN_PX = 1.5;
/** The pick pass's clickable floor in px (a 7 px footprint). WESL twin. */
export const STAR_PICK_MIN_RADIUS_PX = 3.5;
```

- [ ] Parity test pinning all three against `lib/starPhotometry.wesl` and
      `starCatalog/vertex.wesl`, following
      `tests/services/gpu/shaders/famousStarPickRadius.parity.test.ts`.
- [ ] Switch the three divisor sites off `DEFAULT_STAR_SIZE_PX` onto
      `STAR_SIZE_REF_PX`: `starCatalogPass.ts` `starCullMargins` + `buildCutFrustum`,
      and `starCatalogRenderer.ts`'s aggregate cull sphere.
- [ ] Correct the stale prose claiming the two are twins, in
      `lib/starPhotometry.wesl` and `src/data/defaults.ts`.
- [ ] `MPC_TO_PC` onto `SCALE_UNITS`; delete both re-derivations
      (`starCatalogPass.ts`, `engine/helpers/nearestResolvableStar.ts`).
- [ ] `NODE_FADE_MS` → `src/data/starNodeFade.ts`.
- [ ] Delete `subtreeStarCounts.ts` + its test — dead. Its only consumer is its own
      test; `starOctreeIndex` builds `subtreeCounts` internally and its header says
      so ("`subtreeStarCounts` is now a thin accessor onto `subtreeCounts` here").

## Task 2 — Types to `src/@types/rendering/`

One type per file. Also kills a back-edge: `renderers/starCatalog/starPickLeafDraws.ts`
currently imports `PreparedStarCut` _from a frame pass file_.

- [ ] From `starCatalogPass.ts`: `StarNodeStream`, `PreparedStarSource`,
      `PreparedStarCut`, `StarFadeState`, `CatalogStreams` (→ `StarCatalogStreams`).
- [ ] From the renderer helpers: `StarNodeDraw`, `StarCutSnapshot`,
      `StarCutFrustum` (`walkStarOctreeCut.ts`), `StarOctreeIndex`
      (`starOctreeIndex.ts`), `StarPickLeafDraw` (`starPickLeafDraws.ts`).

## Task 3 — Moves

`npm run move-files` for every move (`--dry` first), then grep for stale paths —
it misses `.wesl` `package::` imports and string literals. Tests follow their
subjects; `move-files` drags the `tests/` mirror along.

Pure — no GPU, no engine types → `src/utils/star/`:

- [ ] `starExposureRamp` (zero imports; consumed by `starPointsPass` _and_
      `starCatalogPass`), `starNodeOriginRelCamMpc` (consumed only by
      `engine/helpers`), `starOctreeIndex`, `walkStarOctreeCut`.

Renderer-coupled → `renderers/starCatalog/cut/`:

- [ ] `starPickLeafDraws`.

`renderers/starCatalog/` root keeps only the two renderers plus
`starCatalogLayout.ts`, the bind-group plumbing both renderers import.

## Task 4 — Extract `starCatalogPass.ts`

Every file in `cut/` either produces or consumes a `PreparedStarCut`.

→ `src/utils/star/` (pure):

- [ ] `starCrossfadeOpacity` — takes `crossfadePc` + `camDistPc`, not a registry row.
- [ ] `starCullMargins` — carries its scratch.
- [ ] `buildStarCutFrustum` — made pure by taking the resolved matrix instead of `ctx`:

```ts
export function buildStarCutFrustum(
  rebasedVp: Float32Array | null,
  fovYRad: number,
  canvasHeightPx: number,
  sizePx: number,
  glowOverlap: number,
): StarCutFrustum | null;
```

→ `renderers/starCatalog/cut/`:

- [ ] `starNodeStream` (create + push; `growStream` stays file-local, `resetStream`
      inlines away to `stream.count = 0` at its two call sites).
- [ ] `starFadeState`, `starCatalogStreams` — the two per-catalog WeakMap caches.
- [ ] `starCatalogVisible` — the gate `starAggregatesPass` and
      `starAggregateUpsamplePass` import; they stop importing from a sibling pass file.
- [ ] `computeStarCut`, `prepareStarCut` (memo + `advanceStarFades`).
- [ ] `drawStarStream`, `drawStarPick` — each owns its own 24-float frustum scratch;
      they run at disjoint times, so splitting the shared one changes nothing.
- [ ] `starCatalogPass.ts` ends as imports + the `ContentPass` literal.
- [ ] Delete the `'frame/passes/starCatalogPass': 26` row from
      `tests/services/engine/frame/frameFilePurity.test.ts` — the row goes away, it
      does not shrink.

## Task 5 — Comment budget

The file's 137-line module header redistributes; nothing load-bearing is lost.

- [ ] Each file: header ≤ 5 lines, comment lines ≤ half its code lines.
- [ ] Each landmine lands in the one file that owns it — f64 rebase seam →
      `computeStarCut`; shared-vp invariant → `drawStarStream`; flux-linear ramp →
      `starFadeState`; pick-slack floor → `buildStarCutFrustum`; two-stream split →
      `starCatalogPass`.
- [ ] Collapse the rationale stated three times (the allocation fix) and twice (the
      double buffer) to one statement each.
- [ ] Resolve the header's `(REVIEW THIS)` block — the frustum-prune fade-in
      behaviour note. Two lines, or a backlog item; not carried as-is.

## Task 6 — User smoke test

- [ ] Star bubble at solar-neighbourhood zoom: dots unchanged, no popping.
- [ ] Pan/rotate fast at star-field zoom: no stars winking out at the screen edge
      (the cull-slack fix should make this _less_ likely, never more).
- [ ] Click a field star: still selectable, including near the screen edge.
- [ ] Pull back through the ~2→5 kpc band: crossfade to the Milky Way cloud unchanged.

## Definition of Done

- [ ] `npm test`, `npm run typecheck`, `npm run build` green.
- [ ] `frameFilePurity` has no `starCatalogPass` row.
- [ ] No file imports from `frame/passes/starCatalogPass` except the frame order.
- [ ] `src/utils/star/` holds only one-symbol-per-file pure helpers.
- [ ] `renderers/starCatalog/` root holds only renderers + `starCatalogLayout`.
- [ ] Task 6 smoke attested by the user.
