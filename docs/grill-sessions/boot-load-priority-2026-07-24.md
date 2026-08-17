# Grill Session: Boot Load Priority — 2026-07-24

Source: conversation. The user asked what order assets load in today and whether there is an easy way to change it, motivated by wanting near-Earth data to appear first at boot and body textures to appear first when arriving via `#focus=body-<id>`.

Goal: make a first-time visitor see a correctly rendered first view as fast as possible. Boot currently fetches ~101.7 MB at default settings with no ordering and no concurrency limit, so everything starves everything else. The loading system was designed when the app had no stars, no textured planets, and a Milky Way focus.

---

## Baseline: how loading works today

Established by exploration before any decisions were made. Recorded here because several later decisions depend on it.

- There is **no `cloudLoader` and no `autoLod`** — the docstring at `engine.ts:32` is stale. The real mechanism is a declarative, demand-driven `AssetSlot` system.
- `wireSlots.ts:132` runs the first `reevaluateDemand` pass at boot; `runFrame.ts:171` re-runs it every frame.
- `evaluateRows` (`reevaluateDemand.ts:86-119`) walks `ASSET_WIRING` (`assetWiring.ts:219-343`) in array order and calls `slot.load(...)` for every row that is `idle` and whose `demand(ctx)` is true.
- Those `.load()` calls are **fire-and-forget, fully parallel, unlimited**. Array order is trigger order only, not completion order.
- The only bounded queue in the codebase is `PriorityQueue` (`utils/concurrency/priorityQueue.ts`), 4 concurrent, used **only** for galaxy thumbnails, prioritised by apparent on-screen pixel size.
- `#focus=<id>` does **not** influence load order. Focus resolution *waits on* catalog loads; it never drives them.
- Body textures are the only distance-aware assets: proximity-gated demand with a 2x hysteresis release band (`assetWiring.ts:200-217`).

Boot bandwidth at defaults (tier `medium`): stars 30.0 MB, glade 26.3, mcpm 19.4, milliquas 12.8, sdss 10.1, 2mrs 2.5, plus sidecars ≈ **101.7 MB**. At tier `large`, ≈ 420 MB.

---

## Q1: Is the problem real, and which regime are we targeting?

**The question:** Reordering only pays off if fetches genuinely contend for bandwidth. If the connection is fat enough that everything lands quickly, priority ordering is invisible. Is this an observed symptom or a design instinct?

**Considerations:**
- **Option A (observed on cold/throttled load):** the wrong things visibly appear first. Justifies the full scheduler.
- **Option B (architectural instinct, unmeasured):** would argue for measuring before building.
- **Option C (total time fine, sequence jarring):** argues for ordering but not for reducing volume.

**Decision:** A and C. The datasets have grown to the point where contention makes first view take far longer than it should. The loading system was set up before stars and textured planets existed, when the Milky Way was the focus, so its assumptions no longer hold. This justifies building the scheduler rather than measuring first.

---

## Q2: What is the organizing principle for priority?

**The question:** Everything downstream depends on whether priority is a fixed authored order, a computed distance, or a hybrid.

**Considerations:**
- **Option A (hand-authored fixed rank):** simple, predictable, but static — cannot react to `#focus=`.
- **Option B (distance from focus target):** one rule expresses both "near Earth first" and the Saturn case. Needs every asset to have a representative position; whole-sky catalogs have none.
- **Option C (hybrid, class backbone + distance tiebreak):** fallback if pure distance misorders.

**Decision:** Superseded before it was settled. The user reframed the axis: it is **not primarily position, it is zoom level**. Assets live on rungs of the scale ladder and are simply not drawn at most zooms — galaxy catalogs are invisible at Earth, stars are invisible at intergalactic scale, body textures only matter up close. Priority must be relevance to the target scale rung, with distance secondary. See Q5.

---

## Q3: Where does the bounded scheduler live?

**The question:** With HTTP/2, all requests fire at once and share bandwidth. Reordering `.load()` calls without bounding concurrency does nothing — Earth's texture and a 40 MB `.bin` still download simultaneously and starve each other. So a concurrency bound is the mechanism, not an optimisation. Where does it live?

**Considerations:**
- **Option A (one global scheduler):** unify `AssetSlot` fetches and the thumbnail queue. Conceptually cleanest, widest blast radius, forces one priority metric across two unlike workloads.
- **Option B (AssetSlot fetches only):** bound the `.bin`/texture traffic, leave the thumbnail queue alone. Two queues, but they govern genuinely different regimes: a handful of big one-shot boot fetches vs. many small streaming fetches during flight.
- **Option C (ordering with no limiter):** rejected outright — does not work under HTTP/2.

**Decision:** Option B. The thumbnail queue already solves its own problem well (px-priority, 4 concurrent) and its traffic pattern is unlike ours. A dedicated bounded scheduler at the `AssetSlot`/`evaluateRows` seam is the tighter change. Unification remains possible later if a real reason appears.

---

## Q4: What reference point is priority scored against?

**The question:** Live camera position (re-scored per frame) or the resolved focus destination?

**Considerations:**
- **Option A (live camera):** during a boot fly-in from cosmic distance to Earth, early frames would prioritise galaxies and only prioritise Earth once nearly arrived — starting Earth's fetch late, producing exactly the pop-in being eliminated.
- **Option B (destination):** score against where the camera is heading, so the destination is ready on arrival. Caveat: an interrupted flight keeps favouring the stale target until focus re-resolves.

**Decision:** B initially, with a complexity guard from the user ("if it doesn't make the design too complex"). **Later dropped entirely — see Q8.** Recorded because the reasoning for preferring destination over live camera remains valid should positional priority ever be reintroduced.

---

## Q5: How is the priority score computed?

**The question:** `SCALE_FADE_BANDS` (`presentation/scaleFadeBands.ts`) already exists as a declarative per-asset scale-visibility registry — each row a `{fullAt, goneAt}` evaluated by `fadeBand()`. The 2026-07-02 powers-of-ten audit (§2.5) proposed exactly this registry, and it largely shipped. But its keys are string literals, not asset ids; its units vary per row (Mpc / pc / apparent px); and the asset→band mapping lives implicitly inside each consuming pass.

**Considerations:**
- **Option i (derive from `SCALE_FADE_BANDS`):** evaluate `fadeBand(band, targetDistance)` per asset for a continuous relevance score. Truly scale-aware, single source of truth. Costs an explicit asset→band map, unit normalisation, and inventing bands for assets that lack one.
- **Option ii (coarse hand-authored class rank):** one integer per `ASSET_WIRING` row. No unit math. Not continuously scale-varying — but the demand predicates already gate most scale-irrelevant assets out of the queue, so the scheduler only ever orders currently-demanded assets.
- **Option iii (hybrid):** class rank backbone, band refinement where bands cleanly exist.

**Decision:** Option ii. At the Earth boot destination the bands say essentially everything cosmic is faded to zero anyway, so band math would reproduce what a static rank already gives, at a fraction of the complexity. Reserve option i for a demonstrated case where the static rank misorders a specific pair. Trade-off accepted: priority is not continuously scale-varying.

**Side effect:** the user identified that **filaments and flow have no `SCALE_FADE_BANDS` rows at all** (`filamentsLayer.ts:81-88`, `flowFieldLayer.ts:42-48` gate on user intent only). Flow is ~1000 Mpc across and should fade out below a certain zoom. Backlogged as `docs/backlog/2026-07-24-filaments-flow-scale-bands.md`.

---

## Q6: Do demand gates become destination-aware?

**The question:** Body textures are proximity-gated on the *live camera*, so at boot from Earth, Saturn's texture is not demanded at all — a scheduler has nothing to prioritise. `#focus=body-saturn` therefore cannot be fixed by ordering alone.

**Considerations:**
- **Option A (ordering only):** smallest change, but does not fix the Saturn case.
- **Option B (camera-or-destination union on demand gates):** Saturn demands the instant focus resolves. One consistent rule, but the release/evict hysteresis must then consider both points or an abandoned destination never releases.
- **Option C (separate prefetch path):** a second code path meaning the same thing.

**Decision:** Option A, **plus a universal low-resolution fallback texture set** — the user's counter-proposal. Rather than predicting where the user is going, ship a small texture set for *all* bodies that loads at boot, so every body always has something to show and hi-res streams in on approach. This dissolves the problem instead of solving it: no destination prediction, no union gates, no release-side subtlety. "Arriving before the texture" stops being a failure mode.

---

## Q7: How is the fallback set delivered?

**The question:** The fallback set is unconditional boot bandwidth added to a boot being unclogged. It risks making the headline case worse to fix the secondary one.

**Considerations:**
- **Option A (one packed atlas, single fetch):** one request instead of ~30, trivially ranked as a unit, no per-body priority logic needed. All-or-nothing during download; must be rebuilt when any texture changes.
- **Option B (per-body files, individually ranked):** degrades gracefully, but many small requests, and per-body ranking reintroduces the destination question.
- **Option C (tiered atlases by likelihood):** more machinery.

**Decision:** Option A, with a hard budget of **≤ 1 MB total**. Resolution is whatever hits that budget; 512px was the starting guess and later confirmed feasible (all 19 slots at the existing 2048 tier total 7.4 MB; 512px is 1/16 the pixels, landing around ~0.5 MB). The guarantee is "never an untextured sphere", not "looks good up close".

---

## Q8: Is the destination reference still needed?

**The question:** With Q5 (static rank), Q6 (ordering only) and the fallback atlas all decided, does anything still consume a destination reference?

**Considerations:** Walked each scenario. Boot at Earth: class rank alone gives bodies → stars → galaxies, correct. `#focus=body-saturn`: the atlas covers Saturn visually and hi-res demands on approach as today, correct. Cosmic scale: bodies are not demanded at all, so the rank just orders the cosmic set, correct.

**Decision:** Drop it entirely. Q4's answer was correct given what was known then, but later decisions dissolved its purpose; carrying it would be unmotivated machinery. This removes the focus-target plumbing into `buildDemandCtx`, the re-scoring-on-focus-change behaviour, and the interrupted-flight caveat. The scheduler needs **no positional input at all**.

The feature reduces to three pieces: a bounded-concurrency priority queue at the `AssetSlot` fetch layer, one static `priority` integer per `ASSET_WIRING` row, and a ≤1 MB low-res body-texture atlas.

---

## Q9: The rank table

**The question:** What is the concrete ordering, and does it match intent?

**Considerations:** The band data corroborates the intuition rather than contradicting it. At Earth boot distance (~1 AU ≈ 1.6e-10 Mpc), `surveyDeepZoom` is `goneAt 0.002` Mpc so the galaxy point clouds are **fully invisible**; `starBackdrop` is full near the solar system so **stars are fully visible**. Bodies → stars → galaxies falls out of existing data.

Two judgement calls were flagged: ranking famous galaxies above the bulk catalogs, and splitting local-volume (2MRS/GLADE) ahead of deep (SDSS/DESI).

**Decision:** User flipped ranks 2 and 3, putting **famous galaxies above the star catalog**. Better motivated than first realised: the famous catalog is the *only* exemption from `surveyDeepZoom` in the codebase (`pointSpritesLayer.ts:135-143` and the mirrored pick path at `:186-192`), so famous objects stay visible at close-in scales where the bulk surveys are gone.

---

## Q10: Where does payload size enter the priority?

**The question:** The user observed that small datasets should rank higher because they load quickly and give fast feedback. This is the shortest-job-first result: under bounded concurrency, running small jobs first minimises mean time-to-visible-feedback. So priority is relevance × cost, not relevance alone.

**Considerations:**
- **Option A (baked into the authored integer):** the author knows 2MRS is small and ranks it accordingly. Scheduler stays a single integer.
- **Option B (two-key sort `(rank, expectedBytes)`):** expresses "small first" once in the scheduler rather than per row. But needs a second maintained field, and payload size shifts with tier, so a declared `expectedBytes` would be stale or tier-conditional almost immediately.
- **Option C (computed blend, e.g. relevance/bytes):** most correct, least predictable, loses table readability.

**Decision:** Option A. The row count is small enough that a human can fold size in, and the resulting table is directly readable. If we find ourselves constantly retuning integers to express "small first", that is the signal to promote to option B.

---

## Q11: Preemption

**The question:** When a high-priority asset becomes demanded and all slots are busy with lower-priority work, do we abort in-flight fetches?

**Considerations:**
- **Option A (never preempt):** wastes nothing; worst case the newcomer waits for one big `.bin`.
- **Option B (abort and requeue):** starts the important work now, but discards all bytes already downloaded and may abort a 90%-complete fetch, making total load time worse.
- **Option C (threshold-based):** needs progress tracking, a threshold constant, and a requeue path.

**Decision:** Option A. Three reasons. `AssetSlot`'s existing `AbortController` exists for release/evict (demand genuinely gone), which is a *different* concept from preemption — reusing it would braid two meanings into one mechanism. Responses are not resumable, so preemption's cost is unbounded re-download. Most importantly, the fallback atlas already removes the visual urgency: Earth is never untextured, it merely upgrades later. Option C is the trap — it optimises a case the atlas made invisible.

---

## Q12: The concurrency bound N

**The question:** What is N, and does it need coordinating with the thumbnail queue's own 4?

**Considerations:** Counterintuitively, **lower N is better for time-to-first-visible**. With HTTP/2 all streams share one connection, so 4 parallel fetches give the top-priority one ~25% of the pipe. Serialisation is the point; parallelism is what is being removed.
- **N=1:** top item gets 100% of the pipe, but the wire goes idle during parse/decode.
- **N=2:** one fetch saturating while the next starts/parses.
- **N=4:** reintroduces the bandwidth splitting being eliminated.

**Decision:** N = 2, as a single named constant. Gets nearly all the serialisation benefit while covering the decode-gap idle, since `.bin` parsing is non-trivial CPU work.

On the thumbnail interaction: **no coordination needed** (accepted by default). At the Earth boot view the galaxy point clouds are faded out entirely, so no thumbnails are requested — the thumbnail queue is idle exactly when boot contention matters. To be stated in the spec as an assumption rather than enforced by mechanism.

---

## Q13: How does the queue attach to `AssetSlot`?

**The question:** `priorityQueue.ts`'s own module header explicitly names "catalog .bin downloads, sidecar loaders" as its intended future callers, so it is reused rather than rewritten. But `AssetSlot.load()` returns `void` (`AssetSlot.ts:217-225`) while `PriorityQueue` needs `fetcher: () => Promise<T>` to know when a slot frees.

**Considerations:**
- **Option A (`load()` returns `Promise<void>`):** `evaluateRows` enqueues `() => slot.load(req)`. Scheduling stays in one place, slot construction untouched, API change is additive.
- **Option B (wrap each slot's internal `fetchFn`):** no API change, but threads a scheduling concern into every asset's construction — a knot the simplicity conventions flag.
- **Option C (new scheduler object owning slots):** duplicates what `evaluateRows` already does.

**Decision:** Option A. Returning a promise makes an existing fact visible; the work is already async, the slot merely declines to say so.

**Also in scope:** the release-while-queued drop. `release()`/`cancel()` abort an in-flight `AbortController`, but a queued-but-unstarted entry has no controller yet, so it would start later for a slot whose demand has vanished. The queue needs drop-by-key on release.

**Prep refactor identified:** `MAX_CONCURRENT_FETCHES` is imported module-globally (`priorityQueue.ts:50,120`) and must become a per-instance constructor arg to be 2 for us and 4 for thumbnails.

---

## Q14: Scale-gated demand — fold in or sequence?

**The question:** The inventory revealed that at the Earth boot view, glade (26 MB), sdss (10 MB), milliquas (12.8 MB) and mcpm (19.4 MB) are all invisible per `surveyDeepZoom`, yet all fetch at boot. That is ~68 MB downloaded to render nothing. Reordering makes them arrive later; it does not stop them competing for the pipe or burning mobile data.

**Considerations:**
- **Option A (ordering only):** 101.7 MB still downloads, better ordered.
- **Option B (add a scale-gate to demand):** boot drops to roughly 33 MB. Costs a wait when first zooming out, which the fade-in window could hide if gated on band *approach* rather than band *entry*. No fallback exists for a 26 MB catalog the way the atlas covers bodies.
- **Option C (sequence it as follow-up):** ship ordering now, gate later.

**Decision:** Option C. The two compose — the scheduler reorders what is fetched, the gate reduces what is fetched — but they ship separately. Backlogged as `docs/backlog/2026-07-24-scale-gated-asset-demand.md`, tagged `needs-design`, cross-linked to the filaments/flow bands item since those need bands before they can participate.

---

## Q15: Stars vs. the small assets

**The question:** The star catalog is both the thing the boot view needs and the second-largest payload (30 MB). Relevance says rank it first; shortest-job-first says put tiny assets ahead of it.

**Considerations:** Sub-200 KB assets complete in well under a second and free their slot almost immediately, costing stars almost nothing. N=2 also means stars can occupy one slot for its whole 30 MB while small assets drain through the other in parallel, so the goals are not really in conflict.

**Decision:** Tiny sidecars (famous, structures, constellations) rank above stars. The user further moved **2MRS ahead of stars**.

**Tension recorded rather than hidden:** at the Earth boot view 2MRS is invisible (`surveyDeepZoom` gone) while the star catalog is visible (`starBackdrop` full), so this orders invisible data ahead of visible data. Cost is small — 2.5 MB clears in about a second — and the payoff is that structure is resident the moment the camera pulls back. Accepted knowingly.

**Final table** (lower = fetched first):

| Rank | Asset | Size | Rationale |
|---|---|---|---|
| — | fonts (`cormorant.json` + `.webp`) | 297 KB | Outside the queue; blocks `initGpu` today |
| 0 | fallback body atlas | ~0.5 MB | Small; unlocks every body visually |
| 1 | body hi-res textures | varies | Only proximity-demanded ones are queued |
| 2 | `famous.bin` + `famous_meta.json` | 55 KB | Near-free; exempt from `surveyDeepZoom` |
| 3 | `structures.ccat`+meta, `constellations.json` | 164 KB | Tiny; visible at Earth when enabled |
| 4 | `2mrs.bin` | 2.5 MB | Smallest real catalog, local-volume structure |
| 5 | `stars-medium.bin` | 30 MB | The sky visible at Earth |
| 6 | `sdss-medium` → `milliquas-medium` → `glade-medium` | 10 / 12.8 / 26 MB | Deep shells, small-to-large |
| 7 | `mcpm-medium.scfd` | 19.4 MB | Volume overlay, invisible at boot |
| 8 | filaments, flow, cf4 | off by default | Rarely queued |
| 9 | `pgcAlias` | 1.76 MB | Already lazy on palette open |

Note: famous **stars** need no rank. `FAMOUS_STARS_GENERATED` is committed codegen imported synchronously, riding the JS bundle; the "Rust-only famous subtraction" refers to them being subtracted out of `stars-<tier>.bin` at build time.

---

## Q16: The fonts

**The question:** `cormorant.json` (87 KB) + `cormorant.webp` (210 KB) load inside `initGpu` (`loadFontAtlases.ts:71-75`) and **block renderer construction** with no retry. Nothing else can start until they land.

**Considerations:**
- **Option A (leave blocking, out of scope):** ~300 KB is noise beside ~100 MB.
- **Option B (queue at rank 0):** pointless, since they must still block.
- **Option C (make label rendering tolerate missing fonts):** removes 300 KB of serial head-of-line delay from every cold boot, but teaches the text/MSDF layer a "no atlas yet" state — a subsystem this feature otherwise does not touch.

**Decision:** Option A, with option C backlogged. Mixing C in would widen the blast radius for a few hundred milliseconds.

---

## Q17: How do atlas pixels reach a planet?

**The question:** Once the atlas has downloaded, how does it become visible?

**Structural facts established by exploration:** one `GPUTexture` per (body, kind) — no texture array, so no uniform-size constraint, and sizes already vary (Uranus 2048, Mars 8192). A body with no texture is not drawn untextured; it is drawn by a **different renderer**, `planetRenderer`, as an instanced flat albedo-tinted sphere, routed by `partitionBodiesByPresentation` on `isTextureResident` (which keys on the **surface** slot only). Bind group layouts are explicit, not `'auto'`.

**Considerations:**
- **Option A (new lowest tier fanning one fetch into 19 slots):** **hard blocker.** One `AssetSlot` owns exactly one fetch → one commit, and the 19 body-texture slots are each independently proximity-gated, so they never fire together — Mars's fallback would only demand when already near Mars. Dead.
- **Option B (shader samples the atlas):** add an atlas binding, `atlasRect` + `hasHiRes` uniform fields, and a fragment branch. Precedent exists in the hi-res famous-galaxy path. Costs 2-4 bind-group-layout changes, uniform struct growth, shader edits, and UV remapping — and the `u` address mode is `repeat`, so a remapped tile UV wraps into its neighbour at the seam column, a real artifact needing gutters. Plus iOS shader-validation exposure.
- **Option C (crop tiles into the existing per-body textures at upload):** `copyExternalImageToTexture` accepts a source `origin`, so each tile is cropped straight into that body's own texture — the same one hi-res later overwrites. The atlas is a **transport** format, not a sampling format. No shader change, no binding change, no uniform change, no UV math, no seam risk.

**Decision:** Option C, with two refinements:

1. **Surface kinds only.** `material`/`normal` are LINEAR (`rgba8unorm`) while `surface`/`night`/`clouds` are sRGB (`isLinearTextureKind.ts`), so a combined atlas needs two files or hand-degamma in WGSL. Normal/material are data-gated no-ops with flat placeholders, so their absence is imperceptible during the fallback window. Result: one sRGB atlas, 14 tiles (13 bodies + saturn-ring), ~2048×1024 at 512×256 per tile.
2. **The atlas tile *is* the placeholder.** `texturedBodyRenderer` already has a per-kind 1×1 `placeholderMaps` fallback wired into `buildBindGroup`. Making a body's placeholder be its atlas tile dissolves both problems the exploration flagged: `clearMap` on proximity release restores the atlas tile rather than 1×1 grey, so the eviction-granularity landmine (a slot reading `ready` while its GPU texture is destroyed) cannot bite; and residency stops being a special case.

**Cost flagged:** with every resolved body texture-resident, they all draw through `texturedBodiesLayer`'s per-body path rather than `planetsLayer`'s single instanced batch. Only *resolved* bodies are affected, so likely a handful of extra draw calls — to be confirmed with `npm run perf`, not asserted.

---

## Q18: How is the win verified?

**The question:** `npm run perf` is a **GPU-timing** harness. It measures frame cost, not network scheduling, and will show approximately nothing here. Leaning on it would produce a null result mistaken for "no regression".

**Considerations:**
- **Option A (manual DevTools throttling):** zero build cost, genuinely representative, but not repeatable or comparable across branches.
- **Option B (automated headless capture via Playwright + CDP throttling):** turns the claim into evidence and survives as a regression guard, but is real work.
- **Option C (instrument existing loading events):** every `AssetSlot` already emits structured `[loading] <name> …` lines via `consoleAdapter`, plus `installLoadProgress`. Capture commit timestamps and compare runs. Cheap; measures exactly the quantity of interest.

**Decision:** Option A for now, option C noted as follow-up. Option B resisted as speculative infrastructure — the scale-gating backlog item would want the same harness, so it is better built once when there are two consumers.

**Caveat recorded:** cold-cache discipline matters more than the instrument. A warm CDN or disk cache makes any measurement look good regardless of the change.

---

## Q19: Where is the atlas built?

**The question:** The atlas must be generated from the existing textures in `public/data/images/textures/`, and that generation needs a home.

**Considerations:**
- **Option A (extend the existing body-texture build tool):** single command regenerates everything; the atlas cannot drift from its source textures because they are produced together.
- **Option B (standalone `tools/textures/buildBodyAtlas.ts`):** cleaner isolation, but a second thing to remember — and a stale atlas is a *silent* failure (subtly wrong-looking planet, no error).
- **Option C (generate at Vite build time):** never stale, but puts image processing in every build's critical path, and the project commits its other generated binaries rather than building per-deploy.

**Decision:** Option A. The drift failure mode decides it — a forgotten atlas rebuild after re-curating Mars produces a wrong planet with no error anywhere, exactly the class of bug that survives for months. Coupling emission to tier emission makes staleness structurally impossible.

**Self-correction on the tile layout:** initially recommended a generated `body_atlas.json` sidecar. That is wrong — a sidecar means an extra HTTP round-trip before the atlas is usable, which is precisely the latency this feature removes. The repo already has the better pattern in `famousStars.generated.ts`: committed codegen imported synchronously, riding the JS bundle. The layout is a few hundred bytes and needed immediately, so the same build step emits both the atlas image and a generated TS constant.

---

## Q20: What gets a test?

**The question:** The testing convention requires every test to be capable of failing on a real bug no other test or compiler check catches.

**Considerations:** Several plausible-looking tests violate it. Asserting the rank table's order is a **constant restatement** — the table *is* the spec. Asserting `MAX_CONCURRENT_FETCHES` defaults to 4 is the same problem. Atlas pixel correctness needs a GPU and is covered by the visual check.

**Decision:** Four tests, and nothing else:

1. **The concurrency bound holds** — enqueue 6, assert never more than 2 in flight. This is the entire mechanism; if it silently runs unbounded the feature does nothing while appearing to work.
2. **Release-while-queued drops the entry** — a queued-but-unstarted entry whose slot is released must never start later. Silent and easy to regress.
3. **`load()`'s promise resolves after commit, not after fetch** — if it resolves early, the queue frees a slot while a GPU upload is still running and the bound is a lie under load.
4. **Priority order is respected when slots free** — enqueue out of order, assert the higher-priority entry starts first. Tests the pop behaviour against a mixed queue, not a constant.

Plus repairing existing tests touched by the `load()` signature change and the per-instance limit.

---

## Summary of decisions

The feature is three pieces:

1. **A bounded-concurrency priority queue at the `AssetSlot` fetch layer.** Reuses `PriorityQueue`; N = 2; never preempts; drops queued entries on release. `AssetSlot.load()` gains a `Promise<void>` return; the scheduler lives at `evaluateRows`.
2. **One static `priority` integer per `ASSET_WIRING` row**, with payload size folded in by the author. No positional or destination input.
3. **A ≤1 MB single sRGB atlas of 512×256 surface tiles**, cropped into the existing per-body GPU textures at upload, acting as each body's placeholder. Emitted by the existing body-texture build alongside a generated TS layout constant.

## Prep refactors identified

- `MAX_CONCURRENT_FETCHES` → per-instance constructor arg on `PriorityQueue`.
- `AssetSlot.load()` → returns `Promise<void>` resolving after commit.
- `texturedBodyRenderer` placeholder mechanism → per-body atlas tile rather than per-kind 1×1.

## Spun out to the backlog

- `docs/backlog/2026-07-24-scale-gated-asset-demand.md` — `needs-design`, the ~68 MB win (Q14).
- `docs/backlog/2026-07-24-filaments-flow-scale-bands.md` — `ready`, missing bands blocking scale-gating (Q5).
- `famous_stars_meta.json` fetches unconditionally at boot (120 KB, only needed on star InfoCard open) — `ready`.
- Jupiter/Saturn 404 on the `large` texture tier — `ready`.
- Dead files in `public/data/` — `ready`.
- Non-blocking fonts (Q16 option C) — to be logged.

## Next steps

Run the `refactor-ground` skill over the three prep refactors before the spec is written, per the project convention. PR packaging (prep as separate PR vs. riding the feature PR) is an explicit ask at that checkpoint.
