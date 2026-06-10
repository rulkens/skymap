# Clamp at point of use — design

> **Status:** approved approach (own PR, sequenced first). A small `/simplify`
> un-braiding, prerequisite to the engine-owned settings store
> (`2026-06-10-engine-owned-settings-store-design.md`): it leaves
> `settingsTable.ts` clamp-free so the store PR inherits a `{ name, path }` table.

## Why

`settingsTable.ts` clamps nine settings **at write time** (`setExposure` →
`[0.05, 16]`, the seven flow knobs, `setFilamentIntensity` → `[0, 1]`). That
single clamp expression braids three independent concerns:

- **GPU-safety constraint** — `exposure ≤ 16` (float-buffer), `flow.count ≤
  MAX_PARTICLES` (buffer capacity), `flow.trail ≥ MIN_TRAIL_STEP` (a zero stalls
  the advect compute loop → GPU hang). This belongs to the **consumer that owns
  the constraint** — the renderer that sizes the buffer or runs the loop.
- **UI input/display bounds** — already owned by the slider's `min`/`max`.
- **The stored value** — should be **intent** (what was requested), not silently
  rewritten by the write path.

Clamp-at-write collapses all three into one place, and couples the stored value
to a GPU detail it shouldn't know. Relocating the GPU-safety clamp to the
consumer un-braids them: the store holds raw intent, the slider bounds the UI,
the renderer enforces its own limits at the point of use (simplicity.md #5
value/place, #8 single home — `flow.trail` is literally clamped in **two** places
today).

## The decision: TS clamp helpers at the renderer's upload site

Each clamp moves into a **pure, unit-tested helper co-located with the consuming
renderer**, called at the per-frame uniform-upload site. **Not** into WESL:

- `flow.count`'s clamp must be CPU-side regardless (it sizes the particle buffer
  and the dispatch/draw counts), so a TS home is the one uniform choice across all
  nine — no split between "some in WESL, some in TS".
- Pure helpers are unit-testable with no GPU mock.
- The parity-tested shaders stay untouched (no WESL churn, no visual-verification
  risk — `feedback_wgsl_meticulous`).

The store then holds the raw value; the helper clamps each frame at upload (a
handful of `Math.min`/`max` on scalars — negligible). The slider's `min`/`max`
bounds normal input; only a programmatic/deep-link out-of-range write would show
raw in the UI while the renderer uses the clamped value — acceptable (intent vs
realized), and the GPU stays protected.

## Per-clamp relocation

| Setting | Bound | Consumer upload site (`file:line`) | Existing read-side guard | GPU hazard if dropped |
|---|---|---|---|---|
| `tonemap.exposure` | `[0.05, 16]` | `postProcess.ts:261` (→ `uniformF32[0]`) | none | black frame (lo) / float overflow (hi) |
| `filaments.intensity` | `[0, 1]` | `filamentRenderer.ts:299` (→ `f32[21]`) | none | negative alpha → undefined blend |
| `flow.intensity` | `[0, 1]` | `flowFieldRenderer.ts:371` | none | oversaturation / undefined colour |
| `flow.count` | `[0, MAX_PARTICLES]`, round | `flowFieldRenderer.ts:297, 324, 377` | **none** | **buffer overflow (catastrophic)** — sizes dispatch + draw against a fixed `MAX_PARTICLES`-sized buffer |
| `flow.trail` | `≥ MIN_TRAIL_STEP` | `flowFieldRenderer.ts:315` | **yes — already floored here** | **compute-loop hang** (zero step never breaks the advect loop) |
| `flow.speed` | `≥ 0` | `flowFieldRenderer.ts:316` | none | backward motion (cosmetic) |
| `flow.densityBias` | `[0, 1]` | `flowFieldRenderer.ts:320` | none | skewed spawn (cosmetic) |
| `flow.wander` | `≥ 0` | `flowFieldRenderer.ts:321` | none | inverted turbulence (cosmetic) |
| `flow.boundaryFadeWidth` | `[0, 0.5]` | `flowFieldRenderer.ts:372` | partial (`min` at `flowRender.wesl:120`) | inverted sphere clip (cosmetic) |

Two are load-bearing and must be **relocated, not merely deleted**:

- **`flow.count`** — relocate the `Math.min(MAX_PARTICLES, Math.round(v))` to the
  flow renderer so the dispatch (`:297/:324`) and draw instance count (`:377`)
  can never exceed the fixed buffer. This is the catastrophic one.
- **`flow.trail`** — the renderer **already** floors at `MIN_TRAIL_STEP`
  (`:315`); the table clamp is redundant. Confirm the renderer floor, then delete
  the table clamp. The floor stays the single home.

The seven flow knobs consolidate into one pure `clampFlowParams(flow)` helper in
the flow-renderer module (returns a copy with the numeric knobs clamped;
`enabled`/`mode` pass through), called wherever the renderer reads them.
`exposure` and `filaments.intensity` each get a one-line pure clamp helper at
their renderer.

## What changes in `settingsTable.ts`

- Delete the `clamp?` field from `SettingsDescriptor`, the `clamp(value)`
  application in `buildSettersFromTable`, and the `clamp` entries on the nine
  rows.
- Drop the now-unused `MAX_PARTICLES` / `MIN_TRAIL_STEP` imports.
- Every emitted setter is now `write(path) → echo → requestRender` (the echo +
  the table itself are untouched here — that's the store PR's job).

## Scope guards (non-goals)

- **Only** relocating the nine clamps. No store, no settings-shape change, no echo
  removal (the engine-owned-store PR owns those — this PR is strictly the
  clamp un-braid).
- No WESL edits.
- No new clamps invented — same bounds, new home.

## Testing strategy

- **Pure helpers:** `clampFlowParams` (count → `[0, MAX_PARTICLES]` rounded;
  trail → `≥ MIN_TRAIL_STEP`; speed/wander → `≥ 0`; intensity/densityBias →
  `[0, 1]`; boundaryFadeWidth → `[0, 0.5]`; `enabled`/`mode` pass through),
  `clampExposure` (`[0.05, 16]`), `clampFilamentIntensity` (`[0, 1]`).
- **`settingsTable` no longer clamps:** the existing clamp assertions flip to
  assert the setter stores the **raw** value (intent), e.g. `setExposure(1e9)`
  leaves `settings.tonemap.exposure === 1e9`.
- **Behaviour-preserving:** the renderer still receives clamped values at the GPU
  boundary; existing renderer/visual/parity tests stay green.

## Sequencing

Own PR off `main` (branch `clamp-at-point-of-use`), `subagent-driven-development`.
Then: engine-owned settings store → visibility seam → tour. A final
entanglement-radar pass confirms one home per clamp and no surviving write-time
clamp.
