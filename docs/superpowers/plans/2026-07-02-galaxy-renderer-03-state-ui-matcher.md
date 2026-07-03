# Galaxy Renderer 03 — state, UI, matcher & presets

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking. **Every task that creates or edits a component under `src/ui/` must load the `create-component` skill first.**

**Spec:** `docs/superpowers/specs/2026-07-02-galaxy-renderer-tool-design.md`
**Series:** plan 03 of 3. Requires plans 01 (model) and 02 (engine, shaders, Viewport) landed. After this plan the tool is feature-complete: full control panel, compare/auto-fit panel, multi-galaxy perf test, JSON presets.

**Goal:** Intent-centric state (ADR 0007 at tool scale): one RTK store with six slices (`galaxy`/`render`/`lod`/`compare`/`extras`/`ui`), a single imperative boundary (`engineBridge`) that diffs the store into `GalaxyEngineHandle` calls, the reference-galaxy data tables, the descriptor-based matcher + auto-fit pipeline, the full React UI, and JSON preset download/upload/copy (no browser persistence).

**Architecture:** Components dispatch actions; nothing but the bridge touches the engine. Camera pose stays **engine-owned** — per-frame drag never round-trips the store; the store carries only view *intents* (a nonce-stamped pose the bridge forwards once). The `lod` slice stays separate from `render` (the GPU separates them: camera UBO vs composite UBO — plan 02 Task 3). `data/paramSpec.ts` is the single source of galaxy-slider ranges for BOTH the sliders and the randomizer. Preserve these three un-braided choices — do not re-braid them.

**Tech Stack:** TypeScript, Redux Toolkit (inline-Immer slices, factory-built store per `src/store/createAppStore.ts`'s rationale), react-redux, React, Vitest (fake timers for debounce, typed `vi.fn` fakes for the engine).

**Reference source:** the spike at `/Users/rulkens/Downloads/galaxy-renderer/` — UI logic lives in the script tag of `Galaxy Renderer.dc.html` (cited as `html:NNN`), matcher in `galaxy-matcher.js`. Implementers MUST read the cited lines.

## Global Constraints

- Worktree `.claude/worktrees/better-galaxy-renderer`; `npm test` + `npm run typecheck` green before every commit; stage specific paths only; prettier only touched files.
- RTK slice reducers use descriptive arg names — `(galaxy, action)`, `(compare, action)` … never `s`/`a` (house rule; see `src/state/ui/uiSlice.ts` for the style).
- House conventions as in plans 01/02: `type` never `interface`; one type per `@types` `.d.ts`; Vec3 aliases; didactic timeless comments; typed `vi.fn<…>()`.
- Spike-fidelity constants verbatim: param-regen debounce **130 ms** (html:506), extras-count debounce **220 ms** (html:581), fit grab size **112** (html:703), descriptor size **116** (html:689), fit star budget **220000** (galaxy-matcher.js:169), 3 passes with step fraction `0.32·0.5^pass` (galaxy-matcher.js:207), score `max(1, round(100/(1+7·loss)))` (html:700), post-restore starCount default **600000** (galaxy-matcher.js:224).
- Known port fixes (from the spec — encode, don't rediscover): REFS' duplicate `view` key becomes `viewLabel: string` + `view: ViewPose`; `ngc6946` image → `/images/famous-curated/c12/starless.webp`; the giant elliptical → `m49` (the spike's "m50" file was mislabeled); the Milky Way stays imageless; **no localStorage saves** — JSON download/upload/copy only.
- No planted traps, no TBDs: every table in this plan is complete.

---

## Task 1 — state types + store factory

**Files**
- Create under `tools/galaxy-renderer/@types/state/` (one type per `.d.ts`): `AppState.d.ts`, `CompareState.d.ts`, `ExtrasState.d.ts`, `UiState.d.ts`
- Create under `tools/galaxy-renderer/@types/matcher/`: `MatchReport.d.ts`
- Create: `tools/galaxy-renderer/src/state/createStore.ts`, `tools/galaxy-renderer/src/state/hooks.ts`
- Test: `tests/tools/galaxy-renderer/state/createStore.test.ts`

**Interfaces**

```ts
export type AppState = {
  readonly galaxy: GalaxyParams;      // the full param set incl. the four seeds
  readonly render: RenderSettings;
  readonly lod: LodSettings;
  readonly compare: CompareState;
  readonly extras: ExtrasState;
  readonly ui: UiState;
};
```

```ts
export type CompareState = {
  readonly open: boolean;                                    // panel visibility (drives setInsets)
  readonly activeId: string;                                 // reference id, default 'm100'
  readonly viewIntent: { readonly pose: ViewPose; readonly nonce: number } | null; // one-shot; bridge forwards on nonce change
  readonly fitting: boolean;
  readonly fitProgress: number;                              // 0..1
  readonly fitScore: number | null;                          // 1..100
  readonly fitNote: string;
  readonly report: MatchReport | null;
  readonly stopRequested: boolean;
};
```

```ts
export type MatchReport = {
  readonly armsRef: number; readonly armsRen: number;
  readonly qRef: number;    readonly qRen: number;
  readonly dustRef: number; readonly dustRen: number;
};
```

```ts
export type ExtrasState = { readonly enabled: boolean; readonly count: number; readonly regenNonce: number };
// defaults: false / 8 / 0 — html:471
```

```ts
export type UiState = {
  readonly openSections: Readonly<Record<'shape' | 'arms' | 'pop' | 'dust' | 'glob' | 'render' | 'perf' | 'multi', boolean>>; // all true — html:470
  readonly copyFeedback: string;   // '' | 'copied ✓' | 'failed' | 'loaded ✓' | 'invalid'
  readonly autoRotate: boolean;    // default true; engine toggle intent (not pose) so it lives in the store
};
```

`createStore.ts` — a factory (not a module singleton — same test-isolation rationale as `src/store/createAppStore.ts`):

```ts
export function createGalaxyStore(preloaded?: Partial<AppState>): AppStore;
export type AppStore = /* ReturnType of the configureStore call, typed to AppState */;
export type AppDispatch = AppStore['dispatch'];
```

`hooks.ts`: `useAppDispatch` / `useAppSelector` typed to `AppState` (mirror `src/store/hooks.ts`). Slice initial states come from Tasks 2–3; this task wires whatever slices exist as they land (author it last within the task, after the slices below, or stub-mount progressively — implementer's choice, but the store factory + hooks file are THIS task's deliverable).

**Steps**
- [ ] Failing test: `createGalaxyStore builds an isolated store` — two stores, dispatch to one, the other unchanged; `preloaded state seeds a slice` — pass a partial galaxy override, read it back; `initial state matches the documented defaults` (galaxy === DEFAULT_GALAXY_PARAMS, render === DEFAULT_RENDER_SETTINGS, lod === DEFAULT_LOD_SETTINGS from plan 02's data files).
- [ ] Run → fail. Create the types; then Task 2's three slices are a prerequisite for a compiling store — implement Tasks 1+2 as one commit if the executor prefers, but keep the test files separate.
- [ ] Run → pass. `npm run typecheck`. Commit.

---

## Task 2 — `galaxy` / `render` / `lod` slices

**Files**
- Create: `tools/galaxy-renderer/src/state/slices/galaxySlice.ts`, `.../slices/renderSlice.ts`, `.../slices/lodSlice.ts`
- Test: `tests/tools/galaxy-renderer/state/slices/paramSlices.test.ts`

**Interfaces**

| slice | initial state | actions |
| --- | --- | --- |
| `galaxy` | `DEFAULT_GALAXY_PARAMS` | `paramsPatched(Partial<GalaxyParams>)` — shallow merge |
| `render` | `DEFAULT_RENDER_SETTINGS` | `renderPatched(Partial<RenderSettings>)` |
| `lod` | `DEFAULT_LOD_SETTINGS` | `lodPatched(Partial<LodSettings>)` |

That is the whole write surface — type-button patches, seed rerolls, randomize-all, preset loads and fit results are all just `paramsPatched` payloads computed by their callers (UI/data helpers/bridge). One write path per slice; no bespoke reducers to keep in sync.

**Steps**
- [ ] Failing tests: `paramsPatched merges without clobbering unrelated params` (patch armCount, assert seed untouched); `paramsPatched can swap type and stage patch atomically` (payload with type+bulgeSize); `renderPatched merges`; `lodPatched merges`; `unknown slice actions leave state referentially identical` (dispatch a render patch, galaxy reference unchanged).
- [ ] Run → fail. Implement (inline-Immer `createSlice`; reducer args named `galaxy`/`render`/`lod` + `action`). Run → pass. Commit (with Task 1 if combined).

---

## Task 3 — `compare` / `extras` / `ui` slices

**Files**
- Create: `tools/galaxy-renderer/src/state/slices/compareSlice.ts`, `.../slices/extrasSlice.ts`, `.../slices/uiSlice.ts`
- Test: `tests/tools/galaxy-renderer/state/slices/appSlices.test.ts`

**Interfaces**

compareSlice actions:

| action | payload | behaviour |
| --- | --- | --- |
| `comparePanelToggled` | — | flip `open` |
| `referenceSelected` | `string` | set `activeId`, clear `report` |
| `viewRequested` | `ViewPose` | set `viewIntent = { pose, nonce: prev ? prev.nonce+1 : 1 }` |
| `fitStarted` | — | `fitting=true, fitProgress=0.02, fitScore=null, fitNote='reading photo…', report=null, stopRequested=false` (html:686) |
| `fitProgressed` | `{ progress: number; score: number; note: string }` | write the three fields |
| `fitReportSet` | `MatchReport` | write `report` |
| `fitFinished` | — | `fitting=false, stopRequested=false` |
| `fitStopRequested` | — | `stopRequested=true` |

extrasSlice: `extrasToggled(boolean)`, `extrasCountSet(number)`, `extrasRegenerated()` (nonce++).
uiSlice: `sectionToggled(key)`, `copyFeedbackSet(string)` (`''` clears), `autoRotateSet(boolean)`.

**Steps**
- [ ] Failing tests: one behavioural assertion per action (nonce increments across two `viewRequested`; `referenceSelected` clears a seeded report; `fitStarted` resets the documented fields; toggles flip; nonce++ on `extrasRegenerated`).
- [ ] Run → fail. Implement (`compare`/`extras`/`ui` + `action` arg names). Run → pass. Mount all six slices in `createStore.ts`. Full `npm test` + typecheck. Commit.

---

## Task 4 — data tables: `paramSpec`, `hubbleStagePatches`, `referenceGalaxies`

**Files**
- Create: `tools/galaxy-renderer/@types/data/ParamSpecEntry.d.ts`, `tools/galaxy-renderer/@types/data/ReferenceGalaxy.d.ts`
- Create: `tools/galaxy-renderer/src/data/paramSpec.ts`, `.../data/hubbleStagePatches.ts`, `.../data/referenceGalaxies.ts`
- Test: `tests/tools/galaxy-renderer/data/paramSpec.test.ts`, `.../data/hubbleStagePatches.test.ts`, `.../data/referenceGalaxies.test.ts`

**Interfaces**

```ts
export type ParamSpecEntry = { readonly min: number; readonly max: number; readonly step: number };
// paramSpec.ts
export const PARAM_SPEC: Readonly<Partial<Record<keyof GalaxyParams & string, ParamSpecEntry>>>;
```
Verbatim port of the SPEC table at html:450-461 (radius [0.4, 1.8, 0.05] … globularBright [0.1, 1.5, 0.02] — all 24 rows). This is the ONLY place galaxy slider ranges exist; the spike's per-slider fallback min/max args (html:745) were dead because SPEC always won — they are not ported.

```ts
// hubbleStagePatches.ts
export function hubbleTypePatch(type: string): Partial<GalaxyParams>;
```
Port of the `onType` patch logic (html:519-533), returning `{ type, …category patch }`: lenticular → `dust: 0.15`; elliptical → `dust: 0`; irregular → `hii: 0.1`; spiral/barred stage `a`/`b`/`c` → the bulgeSize/armWinding/armStrength/hii/youngStars quintuples (a: 1.1/0.24/0.9/0.7/0.4 · b: 0.7/0.5/1.1/1.1/0.6 · c: 0.42/0.78/1.2/1.5/0.75). Category comes from `classifyHubbleType` (plan 01) — the spike's duplicate `CAT` is not ported.

```ts
export type ReferenceGalaxy = {
  readonly id: string;
  readonly short: string;        // chip label
  readonly name: string;
  readonly hubbleType: string;   // display string, e.g. 'SAB(s)bc — spiral'
  readonly dist: string;
  readonly diam: string;
  readonly arms: string;
  readonly viewLabel: string;    // 'Face-on', 'Edge-on (6°)', … — the field the spike's duplicate key silently destroyed
  readonly notable: string;
  readonly credit: string;
  readonly img: string | null;   // '/images/famous-curated/<id>/starless.webp'; null for the Milky Way
  readonly params: Partial<GalaxyParams>;
  readonly view: ViewPose;
};
// referenceGalaxies.ts
export const REFERENCE_GALAXIES: readonly ReferenceGalaxy[];
```
Port of REFS (html:389-438) — all eight entries (m100, ngc6946, m58, m104, m31, ell, lmc, mw) with params/view/prose verbatim and the image mapping: m100→`m100`, ngc6946→`c12`, m58→`m58`, m104→`m104`, m31→`m31`, ell→`m49`, lmc→`lmc`, mw→`null`. The spike's per-entry `cat` field is dropped — category derives from `classifyHubbleType(entry.params.type)` (single source; the spike itself already did that for fitting at html:684).

**Steps**
- [ ] Failing tests:
  - paramSpec: `every entry has min < max and positive step`; `spot-check three rows verbatim` (radius, dust [0, 0.7, 0.05], warpTwist [0, 6.28, 0.05]); `every PARAM_SPEC key is a GalaxyParams key` (compile-time via the type, runtime sanity on a known list of 24 keys).
  - hubbleStagePatches: `each patch carries its type`; `E3 zeroes dust`; `S0 sets dust 0.15`; `Irr sets hii 0.1`; `Sa and SBa share the a-stage quintuple`; `Sc loosens arms vs Sa` (armWinding 0.78 > 0.24).
  - referenceGalaxies: `eight entries with unique ids`; `every non-null img points under /images/famous-curated/ and exists on disk` (resolve against `public/` with `node:fs` — this pins the c12/m49 mappings against future re-curation); `the Milky Way is imageless`; `every entry's params.type classifies without throwing and its view is a finite ViewPose`; `viewLabel is non-empty for all eight` (the un-shadowed field).
- [ ] Run → fail. Implement the three data files + two types. Run → pass. Commit.

---

## Task 5 — `randomGalaxyParams` + `buildExtraSpecs`

The randomizer and the perf-test spec builder — pure over an injected RNG so they're deterministic under test (reuse `mulberry32`; never `Math.random()` inside the pure layer — callers inject it via a seeded or entropy-seeded rng at the UI boundary).

**Files**
- Create: `tools/galaxy-renderer/src/data/randomGalaxyParams.ts`, `tools/galaxy-renderer/src/data/buildExtraSpecs.ts`
- Test: `tests/tools/galaxy-renderer/data/randomGalaxyParams.test.ts`, `.../data/buildExtraSpecs.test.ts`

**Interfaces**

```ts
export function randomGalaxyParams(rng: () => number, opts: { readonly includeSize: boolean }): GalaxyParams;
```
Port of html:539-554: uniform type pick from the spike's 14-entry list; every PARAM_SPEC key drawn uniform-in-range then snapped to step (skip radius/starCount when `includeSize` is false); `hii` override — irregular `rng()·0.5`, else `rng()·2`; four fresh seeds `(rng()·1e9) | 0`.

```ts
export function buildExtraSpecs(count: number, rng: () => number): ExtraGalaxySpec[];
```
Port of html:560-569: per spec — `randomGalaxyParams(rng, { includeSize: true })` then `starCount = (40 + floor(rng()·160)) · 1000`; `dist = 26 + rng()·70`; spherical placement `pos = [dist·cos el·cos az, dist·sin el·0.6, dist·cos el·sin az]` with `az = rng()·2π`, `el = (rng()−0.5)·1.3`; `scale = 0.12 + rng()·0.3`; `rotY = rng()·2π`; `tiltX = rng()·π`. (The spike's `params.background = false` line is dead — plan 01 dropped the param.)

**Steps**
- [ ] Failing tests:
  - randomGalaxyParams: `deterministic under a seeded rng`; `every sampled value is inside its PARAM_SPEC range and on-step` (allow 1e-9 step epsilon); `includeSize false leaves radius and starCount undefined`; `irregular hii stays ≤ 0.5` (probe with an rng scripted to pick 'Irr' — or filter over many seeds); `all four seeds are integers`.
  - buildExtraSpecs: `count specs`; `star counts in [40k, 200k] and multiples of 1000`; `distances in [26, 96]`; `deterministic under a seeded rng`.
- [ ] Run → fail. Implement. Run → pass. Commit.

---

## Task 6 — preset serialize/parse

**Files**
- Create: `tools/galaxy-renderer/src/presets/serializeGalaxyPreset.ts`, `tools/galaxy-renderer/src/presets/parseGalaxyPreset.ts`
- Test: `tests/tools/galaxy-renderer/presets/presets.test.ts`

**Interfaces**

```ts
export function serializeGalaxyPreset(galaxy: GalaxyParams, render: RenderSettings, lod: LodSettings): string;
// pretty-printed JSON: { type: 'galaxy-preset', version: 1, p: galaxy, r: { ...render, ...lod } } — html:640
// (the spike's r-bag carried lod knobs; the wire format keeps that flat shape for compatibility,
//  the STORE keeps them split — the seam does the folding, exactly once, here.)

export function parseGalaxyPreset(json: string): {
  readonly p: Partial<GalaxyParams>;
  readonly r: Partial<RenderSettings>;
  readonly lod: Partial<LodSettings>;
} | null;
// null on: unparseable JSON, missing/non-object `p` (html:655-661's validation, made total).
// Splits the flat r-bag back into render vs lod by key (lodApparent/cullBright → lod).
```

**Steps**
- [ ] Failing tests: `round-trips galaxy, render and lod through the wire format`; `wire format matches the spike envelope` (parse the serialized string raw: type/version/p/r keys, lodApparent inside r); `rejects invalid JSON with null`; `rejects a payload without p`; `tolerates a missing r` (spike merged `o.r || {}`).
- [ ] Run → fail. Implement. Run → pass. Commit.

---

## Task 7 — matcher I: descriptor pipeline

**Files**
- Create under `tools/galaxy-renderer/@types/matcher/`: `GalaxyDescriptor.d.ts`, `DescriptorWeights.d.ts`
- Create: `tools/galaxy-renderer/src/matcher/computeDescriptor.ts`, `.../matcher/descriptorLoss.ts`, `.../matcher/dominantArms.ts`, `.../matcher/elevationFromQ.ts`
- Tests: `tests/tools/galaxy-renderer/matcher/computeDescriptor.test.ts`, `.../matcher/descriptorLoss.test.ts`, `.../matcher/dominantArmsAndElevation.test.ts`

**Interfaces**

```ts
export type GalaxyDescriptor = {
  readonly q: number;              // axis ratio, 1 = round, →0 edge-on
  readonly rHalf: number;          // half-light radius, px, floor 2
  readonly fluxFrac: Float32Array; // 15 radial bins over rho = r/rHalf ∈ [0, 3)
  readonly colorInner: number;     // (R−B)/(R+G+B+1) flux-weighted, rho < 0.6
  readonly colorOuter: number;     // same, 0.6 ≤ rho < 2.0
  readonly arm: Float32Array;      // azimuthal residual harmonic magnitudes m = 1..6
  readonly dustIdx: number;        // darker-than-local-mean absorption fraction
};
export type DescriptorWeights = {
  readonly profile: number; readonly q: number; readonly color: number; readonly arm: number; readonly dust: number;
};
```

```ts
export function computeDescriptor(rgba: Uint8ClampedArray | Uint8Array, size: number): GalaxyDescriptor | null;
export function descriptorLoss(a: GalaxyDescriptor, b: GalaxyDescriptor, w: DescriptorWeights): number;
export function dominantArms(d: GalaxyDescriptor): number;
export function elevationFromQ(q: number, category: GalaxyCategory): number | null;
```

Straight ports of `galaxy-matcher.js`: computeDescriptor :10-121 (border-median background, positive-luma cap at the 97th percentile when >20 lit pixels, centroid + second moments → q, half-light radius, NB=15 flux bins, inner/outer colour, RN=10 per-radius means over the 0.5–1.9 annulus, NA=48 azimuthal residual bins, DFT m=1..6 normalised by annulus mean, dust index; returns null when total flux < 1e-6); descriptorLoss :131-138 (weighted sum of squared gaps); dominantArms :124-128; elevationFromQ :161-163 (null for elliptical/irregular; else `clamp(asin(clamp(q, 0.05, 1)), 0.05, 1.45)`).

**Steps**
- [ ] Failing tests (synthesize RGBA test images with small pure helpers inside the test file — grayscale gaussian blobs on black, N=116):
  - `a centered round blob is near-round` — q > 0.85, rHalf > 0, fluxFrac sums to ≈1.
  - `an elongated blob reads as inclined` — σx = 4σy → q < 0.5.
  - `an m=2 azimuthal pattern yields dominant harmonic 2` — two opposing bright arcs painted in the 0.5–1.9·rHalf annulus over a radial disk profile; `dominantArms` === 2.
  - `an all-black frame returns null`.
  - `bright-pixel cap tames a saturated core` — same blob with a blown-out 3×3 core: fluxFrac inner bin changes by less than without the cap (compare against a descriptor of the clean blob; loose tolerance).
  - descriptorLoss: `zero at identity`; `monotone in q gap` (three descriptors differing only in q); `each weight channel contributes independently` (zero weights kill a channel's contribution).
  - elevationFromQ: `null for elliptical and irregular`; `q=1 clamps to 1.45`; `tiny q floors at 0.05`.
- [ ] Run → fail. Implement the four modules. Run → pass. Commit.

---

## Task 8 — matcher II: `fitPlan`, `autoFit`, `loadImageDescriptor`

**Files**
- Create under `tools/galaxy-renderer/@types/matcher/`: `FitPlan.d.ts`, `FitParamRange.d.ts`, `FitResult.d.ts`, `FitStepInfo.d.ts`, `AutoFitOptions.d.ts`
- Create: `tools/galaxy-renderer/src/matcher/fitPlan.ts`, `.../matcher/autoFit.ts`, `.../matcher/loadImageDescriptor.ts`
- Tests: `tests/tools/galaxy-renderer/matcher/fitPlan.test.ts`, `.../matcher/autoFit.test.ts`

**Interfaces**

```ts
export type FitParamRange = readonly [key: keyof GalaxyParams & string, lo: number, hi: number];
export type FitPlan = {
  readonly w: DescriptorWeights;
  readonly params: readonly FitParamRange[];
  readonly arms: readonly number[] | null;   // discrete arm counts to try first; null = skip
};
export function fitPlan(category: GalaxyCategory, q: number): FitPlan;
```
Verbatim tables from `galaxy-matcher.js:141-157` — per-category weights, optimisable param ranges, `armOK = q > 0.4` gating (arm weight 5 vs 1; arms list [1..6] vs null), barred appends `['barStrength', 0.4, 1.6]`.

```ts
export type FitStepInfo = {
  readonly iter: number; readonly loss: number;
  readonly params: GalaxyParams; readonly desc: GalaxyDescriptor | null; readonly note: string;
};
export type FitResult = {
  readonly params: GalaxyParams; readonly loss: number; readonly desc: GalaxyDescriptor | null;
  readonly iters: number; readonly history: readonly number[];
};
export type AutoFitOptions = {
  readonly size?: number;        // grab size, default 116 (matcher.js:167)
  readonly passes?: number;      // default 3
  readonly fitStars?: number;    // default 220000
  readonly signal?: { stop: boolean };
  readonly onStep?: (step: FitStepInfo) => void;
};
export function autoFit(
  engine: GalaxyEngineHandle, reference: GalaxyDescriptor, seed: GalaxyParams,
  category: GalaxyCategory, opts?: AutoFitOptions,
): Promise<FitResult>;
```
Port of `galaxy-matcher.js:166-227`: score = setParams → grab → computeDescriptor → descriptorLoss (null descriptor scores 1e9); discrete arm-count sweep first when `plan.arms`; then `passes` coordinate-descent rounds, step `(hi−lo)·0.32·0.5^pass`, both directions, accept on `loss < cur − 1e-6`; `setTimeout(0)` yield between evaluations (keeps the UI live); stop-signal checked after every evaluation; `finish()` restores `starCount: seed.starCount || 600000`.

```ts
export function loadImageDescriptor(url: string, size?: number): Promise<{ desc: GalaxyDescriptor | null; width: number; height: number }>;
```
Port of `galaxy-matcher.js:230-242` — Image + canvas cover-crop centre square → `computeDescriptor`. DOM-thin; no unit test (node env has no Image/canvas), exercised visually via the compare panel.

**Steps**
- [ ] Failing tests:
  - fitPlan: `elliptical optimises only bulgeSize with zero arm weight`; `barred appends barStrength to the spiral param set`; `edge-on q disables the arm sweep` (q 0.3 → arms null, arm weight 1); `face-on spiral sweeps arms 1..6`.
  - autoFit (drive a scripted fake `GalaxyEngineHandle` — typed `vi.fn` methods; `grab` returns a synthetic image whose descriptor loss is a known function of the last `setParams` payload, e.g. brightness ∝ one param so loss is convex): `loss history is non-increasing at accepted steps` (final loss ≤ first history entry); `onStep fires with monotonically growing iter`; `stop signal ends the run early` (set `signal.stop` inside `onStep` after 3 steps; assert far fewer evaluations than a full run and a well-formed FitResult); `fit runs at the reduced star budget and the result restores the seed count` (every mid-fit `setParams` call saw `starCount === 220000`; `result.params.starCount === seed.starCount`); `a null-descriptor frame is never accepted` (grab one black frame mid-run; loss stays finite in history).
- [ ] Run → fail. Implement. Run → pass. Commit.

---

## Task 9 — `engineBridge`

The single imperative boundary. Subscribes to the store, diffs slice-by-slice by reference, calls the handle; engine feedback comes back as plain actions. Nothing else in the tool may hold the engine.

**Files**
- Create: `tools/galaxy-renderer/src/state/engineBridge.ts`
- Test: `tests/tools/galaxy-renderer/state/engineBridge.test.ts`

**Interfaces**

```ts
export function connectEngineBridge(
  store: AppStore,
  engine: GalaxyEngineHandle,
  deps?: { readonly rng?: () => number },   // extras randomness seam; defaults to Math.random at this boundary
): () => void;                              // disconnect: unsubscribe + clear pending timers
```

Reaction table (diff by slice reference — RTK guarantees a fresh reference per real change):

| observed change | engine call | timing |
| --- | --- | --- |
| `galaxy` slice | `setParams(state.galaxy)` | trailing debounce **130 ms** — one call per burst (html:506). **Suppressed while `compare.fitting`** — autoFit drives the engine directly; reacting to its per-step `paramsPatched` echoes would double-generate. |
| `render` or `lod` slice | `setRender({ ...render, ...lod })` | immediate |
| `ui.autoRotate` | `setAutoRotate(value)` | immediate |
| `compare.open` | `setInsets(open ? 390 : 0, 340)` | immediate (panel widths, html:493/597) |
| `compare.viewIntent.nonce` | `setView(pose)` | immediate, once per nonce |
| `extras.enabled` false→true, or `regenNonce` bump | `setExtras(buildExtraSpecs(count, rng))` | immediate |
| `extras.count` while enabled | same | trailing debounce **220 ms** (html:581) |
| `extras.enabled` → false | `setExtras([])` | immediate |

On connect: one initial sync — `setRender({ ...render, ...lod })`, `setInsets(...)`, `setAutoRotate(...)`, `setParams(galaxy)` (not debounced; it is the boot render). Engine feedback (`onFps`/`onStats`) is NOT this module's concern — plan 02's Viewport owns the engine callbacks and plan 03's App routes them to local component state (they are per-frame telemetry, not intent; keeping them out of the store avoids 60 Hz dispatches).

**Steps**
- [ ] Failing tests (fake engine: object of typed `vi.fn`s, e.g. `setParams: vi.fn<(p: GalaxyParams) => Promise<void>>().mockResolvedValue(undefined)`; `vi.useFakeTimers()`):
  - `connect performs the initial sync` (one setRender, one setInsets, one setAutoRotate, one setParams).
  - `three rapid param patches yield one debounced setParams` — advance 129 ms → still initial-only; advance past 130 → exactly one more, with the final merged params.
  - `render changes call setRender immediately and never setParams`.
  - `lod changes ride the same setRender path`.
  - `view intent fires setView once per nonce` — same-pose second `viewRequested` (nonce bump) fires again; unrelated dispatches don't re-fire.
  - `compare open/close drives setInsets 390/0`.
  - `extras enable → immediate setExtras with count specs; count change debounces 220 ms; disable → setExtras([])` (inject a seeded rng; assert spec count).
  - `param patches during a fit do not reach setParams` — dispatch `fitStarted`, patch params, run all timers: no setParams; after `fitFinished`, the next patch debounces normally.
  - `disconnect silences everything` — call the returned disposer, dispatch + run timers, no further engine calls.
- [ ] Run → fail. Implement. Run → pass. Commit.

---

## Task 10 — `runCompareFit`

The auto-fit orchestration (the spike's `autoFit` handler, html:681-725) as a store-driven procedure the ComparePanel invokes through the bridge-owned engine. Kept out of `engineBridge` proper so the bridge stays a diff table; kept out of the component so the sequence is testable.

**Files**
- Create: `tools/galaxy-renderer/src/state/runCompareFit.ts`
- Test: `tests/tools/galaxy-renderer/state/runCompareFit.test.ts`

**Interfaces**

```ts
export async function runCompareFit(args: {
  readonly engine: GalaxyEngineHandle;
  readonly reference: ReferenceGalaxy;        // must have img !== null (UI disables the button otherwise)
  readonly seedParams: GalaxyParams;          // current galaxy state merged with reference.params (html:699)
  readonly store: AppStore;                   // dispatch target + stopRequested reader
  readonly descriptorCache: Map<string, GalaxyDescriptor>;  // per-session ref-descriptor memo (html:688-689)
  readonly loadDescriptor?: typeof loadImageDescriptor;     // injectable for tests
}): Promise<void>;
```

Sequence (each step cites html): load/memoize the reference descriptor at size 116 (:689); `elevationFromQ` → `setView({ az: 0.6, el: el ?? reference.view.el, dist: reference.view.dist })`, `setAutoRotate(false)` (:690-693); warm-up `40 × step(t0 + i·33)` (:694); progress estimate `1 + (spiral|barred ? 6 : 0) + 3·nParams·2` with the per-category nParams table {spiral 8, barred 9, elliptical 1, irregular 5, lenticular 4} (:696-697); dispatch `fitStarted`; run `autoFit(engine, Dref, seed, category, { passes: 3, size: 112, signal, onStep })` where onStep dispatches `paramsPatched(step.params)` + `fitProgressed({ progress: min(0.98, ev/est), score, note })` and `signal.stop` mirrors `compare.stopRequested` via a store subscription; on completion dispatch the final `paramsPatched`, `fitProgressed({ progress: 1, … note: 'done' })`, `engine.setParams(best)`, settle `20 × step` (:712), grab 116 → render descriptor → `fitReportSet` (:713-718); errors land in `fitProgressed({ …note: 'error: ' + message })`; finally `fitFinished` + `setAutoRotate(store ui.autoRotate)` (:722-724). Score mapping `max(1, round(100/(1+7·loss)))` (:700).

**Steps**
- [ ] Failing tests (fake engine + injected `loadDescriptor` resolving a canned descriptor; real store):
  - `dispatches fitStarted then a done fitProgressed and fitFinished in order` (record dispatched action types via `store.subscribe` snapshots or a wrapped dispatch).
  - `disables auto-rotate during the fit and restores the store's setting after`.
  - `stopRequested in the store stops the fit` (dispatch `fitStopRequested` from an onStep-triggered subscription; autoFit's signal must observe it).
  - `a failing image load reports an error note and still finishes` (injected loader rejects; state ends `fitting: false`, note starts with 'error:').
  - `the reference descriptor is memoized` (run twice with the same cache; loader called once).
- [ ] Run → fail. Implement. Run → pass. Commit.

---

## Task 11 — UI foundation: shared vocabulary + primitive components

**Load the `create-component` skill first.** Every component: own folder under `tools/galaxy-renderer/src/ui/`, `<Name>.tsx` + `<Name>.module.css`, `function Name() {}` + default export, top-level `.root` class, `cx` (classnames) for conditional classes, readonly props.

**Files**
- Create: `tools/galaxy-renderer/src/ui/shared.module.css` — the tool's design vocabulary: the `galaxy.css` custom properties (`--bg`, `--panel`, `--text*`, `--accent*`, `--good`, `--warn`, fonts — `/Users/rulkens/Downloads/galaxy-renderer/galaxy.css:6-29`) plus composable classes for the button variants (`.btn`, `.btnPrimary`, `.btnGood`, `.btnGhost`, `.btnBlock` — galaxy.css:46-55), section headers, mono badges, range-input styling. Components pull vocabulary via `composes: … from './shared.module.css'` — never `:global`.
- Create components: `CollapsibleSection/`, `ParamSlider/`, `TonemapSelect/`
- No unit tests (spec test scope is pure parts; UI is verified visually) — but every component must typecheck.

**Interfaces**

```ts
export type CollapsibleSectionProps = {
  readonly title: string;             // rendered upper-case, letter-spaced (the spike's section headers)
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
};
```

```ts
export type ParamSliderProps = {
  readonly label: string;
  readonly value: number;
  readonly min: number; readonly max: number; readonly step: number;
  readonly format?: (value: number) => string;   // default two-decimal; spike variants: '×', 'k', '°', integer (html:750-788)
  readonly onChange: (value: number) => void;
  readonly onReseed?: () => void;                // renders the 🎲 die when present (seed-linked noise params)
};
```

```ts
export type TonemapSelectProps = { readonly value: TonemapMode; readonly onChange: (mode: TonemapMode) => void };
// five options, labels per html:299-303
```

**Steps**
- [ ] Load `create-component`. Build `shared.module.css` + the three components.
- [ ] `npm run typecheck` green. Commit.

---

## Task 12 — UI: control panel column

**Load the `create-component` skill first.**

**Files**
- Create components: `TypePicker/`, `MultiGalaxySection/`, `PresetsSection/`, `ControlsPanel/`

**Interfaces & behaviour**

`TypePicker` — the Hubble-sequence chip rows (E0–E7 / S0 / Irr / Sa–Sc / SBa–SBc, html:154-193). Props: `{ readonly activeType: string; readonly onSelect: (type: string) => void }`. Parent dispatches `paramsPatched(hubbleTypePatch(type))`.

`MultiGalaxySection` — enable checkbox, 1–200 count slider, regenerate button (html:329-346). Reads `extras` slice; dispatches `extrasToggled` / `extrasCountSet` / `extrasRegenerated`. (Debounce lives in the bridge, NOT here — the component stays dumb.)

`PresetsSection` — Download / Upload / Copy row + hint text (html:348-370 minus everything localStorage: no save-to-browser button, no saved chips). Download = `serializeGalaxyPreset` → Blob → anchor click, filename `galaxy-<type>-<Date.now()>.json` (html:639-647); Upload = hidden file input → `parseGalaxyPreset` → dispatch `paramsPatched(p)`, `renderPatched(r)`, `lodPatched(lod)` + `copyFeedbackSet('loaded ✓' | 'invalid file')`; Copy = clipboard write of the serialized preset + `copyFeedbackSet('copied ✓' | 'failed')`, cleared after 1600 ms (html:634-637).

`ControlsPanel` — the right column (width 340, html:149): Randomize-everything button (dispatches `paramsPatched(randomGalaxyParams(rng, { includeSize: false }))` — `Math.random`-seeded `mulberry32` at the click site), TypePicker, then the collapsible slider groups. Group composition + per-category visibility ports html:749-794 exactly, reading ranges ONLY from `PARAM_SPEC`; seed-die wiring per html:759-769 (irregularity + armEdgeVar → `asymSeed`, armClump → `clumpSeed`, armWave → `waveSeed`; reroll dispatches `paramsPatched({ [seedKey]: (rng()*1e9)|0 })`). Rendering section: exposure/bloom/saturation/star-size sliders (ranges html:796-801) **plus vignette (0–1, step .02) and star intensity (0.02–0.4, step .01)** — the two RenderSettings fields the spike engine had but its UI never exposed (resolved spec ambiguity: the render slice owns them, so the panel shows them); TonemapSelect; auto-rotate checkbox (`autoRotateSet`); New-random-seed button (`paramsPatched({ seed: (rng()*1e9)|0 })`); PERFORMANCE (LOD) section — lodApparent 0–0.02/.001, cullBright 0–0.4/.01 + the explainer copy (html:315-327); MultiGalaxySection; PresetsSection. Section open state from `ui.openSections` via `sectionToggled`.

**Steps**
- [x] Load `create-component`. Build the four components (ControlsPanel composes the rest; keep it a layout/dispatch shell — logic lives in the data helpers).
- [x] `npm run typecheck` green. Commit.

---

## Task 13 — UI: Hud, ComparePanel, App, main.tsx

**Load the `create-component` skill first.**

**Files**
- Create components: `Hud/`, `ComparePanel/`, `App/`
- Replace: `tools/galaxy-renderer/src/main.tsx` (plan 02's minimal version)

**Interfaces & behaviour**

`Hud` — top-left title block + badges (html:44-54): FPS pill (green ≥ 55, amber below — html:815-821), star count, dust count (`k` formatting html:835-836). Props: `{ readonly fps: number; readonly stars: number; readonly dust: number }` — fed from App's local telemetry state, not the store.

`ComparePanel` — the left validation panel (width 390, html:63-145): reference chips (`referenceSelected`), reference image card + credit, facts grid (distance/diameter/arms/**viewLabel**), notable prose, "Load preset →" (dispatch `paramsPatched({ ...galaxy, ...ref.params })` shape per html:602 + `viewRequested(ref.view)`), "Match view" (`viewRequested(ref.view)`), auto-fit block: score pill (colour thresholds ≥78 good / ≥55 warn — html:813), fit button — **disabled with a "no photo — model only" hint when `ref.img === null`** (the Milky Way; the spike error-pathed instead), progress bar + note + stop (`fitStopRequested`), match report rows (arms/q/dust, `ref → ren` formatting html:862-864). The fit button invokes `runCompareFit` with the engine handle it receives via props from App and the module-level descriptor cache.

`App` — owns the store-adjacent glue: renders `Viewport` (plan 02) + overlay chrome (Hud, compare-toggle button, ComparePanel when `compare.open`, ControlsPanel). On `Viewport.onEngine`: `connectEngineBridge(store, engine)` (disconnect on null/unmount); routes `onFps`/`onStats` into local state for Hud. Compare toggle button (html:57-61) dispatches `comparePanelToggled`.

`main.tsx` — `createGalaxyStore()` + react-redux `<Provider>` + `<App />`.

**Steps**
- [ ] Load `create-component`. Build Hud, ComparePanel, App; rewrite main.tsx.
- [ ] `npm run typecheck` + full `npm test` green.
- [ ] **Visual gate** — ask the user to exercise, at `http://localhost:5400`:
  1. sliders regenerate after a short pause (130 ms debounce), render sliders apply live;
  2. type chips restyle the galaxy per stage patch; seed dice reroll only their noise family;
  3. compare panel: chips switch references, Load preset matches the photo's pose, auto-fit runs with live progress + stop, report fills in; Milky Way's fit button is disabled;
  4. multi-galaxy toggle populates background galaxies and the FPS badge reacts; count slider settles after ~220 ms;
  5. presets: download a JSON, tweak sliders, upload it back → state restored; copy shows feedback;
  6. panels inset the framing (galaxy re-centres between them).
- [ ] Commit.

---

## Task 14 — plan gate: entanglement radar + full suite

- [ ] Run the `entanglement-radar` skill over the full tool diff (all three plans' surface: `tools/galaxy-renderer/`, `src/utils/random/makeValueNoise.ts`, `tests/**`). Findings to specifically check (the spec's un-braided choices must have survived): lod vs render stayed split end-to-end; camera pose never entered the store; `PARAM_SPEC` is the only range table (no copies in components); `classifyHubbleType` has no duplicate; preset wire-format folding happens only in `presets/`; the bridge is the only engine caller (grep for `GalaxyEngineHandle` consumers). File real findings as fixes in this task or as backlog details — do not ship known braids silently.
- [ ] `npm run typecheck` (both configs) green.
- [ ] Full `npm test` green (entire repo suite, not just the tool's).
- [ ] `tools/galaxy-renderer/README.md` final pass: features, controls, compare workflow, preset format, port table (5400).
- [ ] Prettier touched files; commit.
- [ ] Hand off: plans complete → run `/feature-done` (gates the DoD, relocates spec + plans to `completed/`).
