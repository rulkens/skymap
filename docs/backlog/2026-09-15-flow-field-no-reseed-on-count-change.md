# Flow field does not reseed on a particle-count change

> **Backlog item** · `needs-verification` · area: Rendering
> **Promote to:** a bug-fix branch (failing test first) once the cause below is confirmed.

## Symptom

Settings › Flow with the field on: changing the particle count does nothing visible. Confirmed 2026-09-15 by the user on the deployed build and on main `dc222eaef` (so it predates the 04b saga→frame move of the reseed, which preserved the behaviour exactly).

## What is known (read, not yet instrumented)

- The count control dispatches `setFlow({ count })` (`src/layers/flow/ui/FlowTuningSectionContainer.tsx`).
- The reseed latch is armed on that change — via `watchFlowReseedSaga` → `maybeReseed()` on main, via `flowFieldRenderer.reconcile({ mode, count })` per frame after 04b — and consumed in `encodeCompute` (`src/layers/flow/render/flowFieldRenderer.ts`, the `reseed.consume()` branch), which dispatches the `seed` kernel before the integrate pass.
- `count` defaults to `MAX_PARTICLES` = 50 000, which is also the slider ceiling and the buffer capacity (`src/data/flow/flowFieldConstants.ts`), so the only reachable change is a decrease; the draw already instances `f.count` (`pass.draw(2 * TRAIL, f.count)`), so fewer ribbons should be visible after a decrease.

## Hypotheses, in the order to test

1. The seed kernel's positions are a pure hash of the particle index, so a reseed lands every surviving particle exactly where it was first seeded and the ribbon trail ring is not cleared — the head jump is hidden under the stale trail. Check `seed` in the flow `.wesl` and whether `trail` is zeroed on reseed.
2. The latch is consumed by a frame whose `encodeCompute` bails early (`field === null || !computeBindGroup`) — no: the bail is before `consume()`. Rule out with one console line at the `consume()` site.
3. The decrease is visually indistinguishable at these densities (50k → 40k ribbons). Test with a drop to the slider minimum.

## Fix shape

Whichever hypothesis holds, the fix is renderer-local (seed kernel / trail clear / draw count) and needs one test at `tests/layers/flow/render/flowFieldRenderer.test.ts` that pins "a count change encodes a seed pass and clears the trail".
