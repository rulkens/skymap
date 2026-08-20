# Debug derivation — rung 6 of the engine-composition ladder

**Status.** Ready to execute on `refactor/debug-derivation` (base `0b4ce84c0` —
still the code baseline: `70aaa0002` adds only this plan file).
**Date.** 2026-08-20 (amended same day after three user rulings and two
verifications — see D5, D6, D10).
**Scope.** Rung 6 of the ladder in
[`docs/research/engine/decisions.md`](../../research/engine/decisions.md)
(decision #9): _"**6** debug derivation"_ — the only rung #9 names without a
parenthetical shape. It carries decision #4's architecture clause (_"declarative
subsystem bundles (Level 2) + derived debug (Level 3's honest half)"_, with
Level-4 schema-generated settings UI **explicitly rejected**,
`decisions.md:27-32`), decision #7's `devOnly` clause (`decisions.md:59-60`), the
contract sketch's `debug?: { groupTitle, sliders? }` field (`decisions.md:575`),
and the W6 walker sketch (`current-contracts-map.md:232,259`). Under #10
(row-divergence), #12 (rows keyed in their own domain) and #13's survey-first
method. **No separate spec** — decisions.md is this rung's authority, as for
rungs 2–5.

**Evidence of record.** Three surveys were run at this HEAD before this plan was
written: the mandate sweep (every #4/#7/#9/#10 clause bearing on rung 6), the
debug-surface census (8 surfaces, layer/renderer/settings/UI touchpoints), and
the derivation-seam survey (precedent walkers, the frame program, production-vs-
debug wiring, the settings path, `devOnly`/`import.meta.env.DEV` usage). They
were session scratchpad artifacts, not repo files. **Every load-bearing claim
below was re-verified against the tree at `0b4ce84c0`** and is cited
`file:line`; three survey claims were contradicted and are flagged as findings.
Nothing in this plan depends on reading the surveys.

**Ground preparation.** None needed — the ladder **is** the ground-prep
programme (#9), and this rung is itself ground prep for the deferred
`SubsystemBundle` umbrella: it settles what a bundle's `debug` field would mean
before any umbrella type is minted. `refactor-ground` is not re-run per rung.
Rungs 1 (#571), 2 (#575), 3 (#579), 4 (#583) and 5 (#591) have landed; no prep
refactor precedes the tasks below.

**Headline.** "Derived debug" is already **half shipped and half
mis-diagnosed**. The half that works — timing slots, group buckets, the render-
toggle list — has been a pure projection of `(frameProgram × CONTENT_LAYERS)`
since renderer unification (`frameProgram.ts:247-293`), and a new layer joins all
three for **zero edits**. The half `current-contracts-map.md:194` flags as
hand-listed turns out to be three different things with three different verdicts:
the slider tables are **already registries** (the map is stale), the DebugPanel
section list is **deliberately** hand-written (deriving it is the rejected Level
4), and `PASS_GROUP_TITLES` accretes per **frame step**, not per subsystem — the
one artifact #4 keeps hand-authored on purpose. What is genuinely
O(n)-hand-maintained is none of those: it is the **settings surface** behind the
three debug booleans — 9 touchpoints each, three hand-rolled copies of one shape,
sitting one field away from `disabledPasses`, which the same file's doc comment
already advertises as the generic answer (`EngineSettingsState.d.ts:420-430`).
This rung folds those three onto one open-world record driven by one
`DEBUG_OVERLAY_ROWS` table, unifies the duplicated `SliderField` row type and the
duplicated tuning-section component behind it, and builds **no walker, no
registry of layers, and no `devOnly` flag**.

## What this rung does and does not touch

**In scope:**

- `settings.debug.showPickBuffer` / `showDiskRadiusRing` /
  `showOrbitTrailImpostor` (`EngineSettingsState.d.ts:432-434`) → one
  `overlays: Record<DebugOverlayKey, boolean>` seeded from a
  `DEBUG_OVERLAY_ROWS` table. Deletes three default constants
  (`defaults.ts:482,485,488`), three reducers (`settingsSlice.ts:352-360`),
  three selectors (`selectors.ts:228-235`) and three container pairs
  (`DebugOverlaysSectionContainer.tsx:25-51`).
- The three read sites, re-keyed: `diskRadiusRingLayer.ts:49`,
  `drawPickDebugOverlay.ts:76`, `orbitTrailsLayer.ts:326`.
- `DebugOverlaysSection.tsx` becomes row-driven (map over `DEBUG_OVERLAY_ROWS`),
  the same idiom `FlowTuningSection`/`MilkyWayTuningSection`/
  `ZoneOfAvoidanceTuningSection` already use for sliders.
- One shared `SliderField<K>` row type; `MilkyWaySliderField` and
  `ZoneOfAvoidanceSliderField` (byte-identical today apart from the key) and
  `FlowSliderField` become aliases over it.
- **One generic `DebugTuningSection`** (D10, user-ruled): the `DebugSection`
  shell + the `DebugSlider` `.map()` that
  `MilkyWayTuningSection.tsx:42-55`, `FlowTuningSection.tsx:34-47` and
  `ZoneOfAvoidanceTuningSection.tsx:34-47` each spell out are written **once**;
  the three sections instantiate it with their registry, values and patch fn and
  keep their own extras as children. Rendered DOM byte-identical.
- **One ≤2-line header note on `fieldStarSphereLayer.ts`** recording why the
  layer needs no `FOREGROUND_MAX_DISTANCE_MPC` gate (D6). Comment only — **no
  gate is added**; the verification proved the suspect negative.
- **decision #16** in decisions.md: the ten rulings below, plus the four
  now-contradicted clauses amended in place (#9's rung-6 entry, #7's `devOnly`
  and step-gate clauses, P1's derived-debug deliverable) and a fifth: #11's
  `fieldStarSphere` bug-suspect closed **RESOLVED NEGATIVE**
  (`decisions.md:141`). The rung's durable deliverable.
- The doc sweep across the research maps this rung makes stale, and one backlog
  detail file for the one deferral that has no home today.

**Out of scope, with reasons:**

- **A `devOnly` field on `ContentLayer`** (D3) — #7 names it; the census says it
  has no reader that is not a single row's quirk (#10).
- **The `pickDebugOverlay` second command encoder** (D5) — stays outside
  `frameProgram`; deferred to a named backlog item that now carries the user's
  **design target** (pick execution as a parallel frame-program instance) and
  the audit that priced it.
- **`FOREGROUND_MAX_DISTANCE_MPC`'s step-gate hoist** (D6) — #7's other clause in
  the same bullet list; not executable as written, and not debug. **No gate is
  added to `fieldStarSphereLayer`** — the suspect verified negative (D6).
- **Deriving `PASS_GROUP_TITLES`, the DebugPanel section list, or any JSX** (D2)
  — the first relocates a fact and loses one, the second two are the rejected
  Level 4 (#4).
- **`maybeLazyLoadDebugVolume`'s three fixtures, `renderStrategy`,
  `disabledPasses`** (D8) — supply-path and already-generic infra.
- **The debug layers' `enabled()` gates** — three different shapes for three
  essential reasons (D4); a shared "debug gate" combinator is the fake-unified
  registry #6 bans.
- **`handle.debug.*`** (`engine.ts:864-884`) — an observability namespace that
  merely shares the token "debug" with the settings cluster (finding 5).
- **The `SubsystemBundle` umbrella and its `debug` field** — deferred by #9 until
  the rungs land.
- **Rung 7+** — the `FADE_ROW`/`VISIBILITY_ACTION_ROW` derivation decision,
  label-mechanism unification (rung 8).

## The census, in one table

Eight debug surfaces in `src/services/engine/`, `src/services/gpu/`,
`src/state/` and their `DebugPanel` consumers.

| #   | surface                             | shape today                                                        | this rung                                    |
| --- | ----------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| 1   | `diskRadiusRingLayer`               | `ContentLayer` (swap·COSMO) + bespoke boolean                      | key on the record                            |
| 2   | `clipPathDebugLayer`                | `ContentLayer` (swap·NEAR0), gate = subsystem snapshot presence    | **untouched**                                |
| 3   | `pickDebugOverlay`                  | **not** a `ContentLayer` — own encoder + submit, `runFrame.ts:697` | key on the record; the encoder deferred (D5) |
| 4   | `showOrbitTrailImpostor`            | in-layer draw ARGUMENT (`orbitTrailsLayer.ts:326`), not a layer    | key on the record                            |
| 5   | `maybeLazyLoadDebugVolume`          | 3 DEV fixtures, `import.meta.env.DEV`-gated supply path            | out (D8)                                     |
| 6   | `disabledPasses` / `renderStrategy` | already generic + open-world                                       | out — the positive counter-examples          |
| 7   | `logCameraState`                    | console only, draws nothing                                        | out                                          |
| 8   | `frameStats` / `handle.debug.*`     | always-on observability getters                                    | out (finding 5)                              |

**Three toggles, three hand-rolled chains, one shape.** Rows 1, 3 and 4 each
cost the same nine settings/UI touchpoints (type field · default constant ·
seed · reducer · selector · container selector · container callback · section
prop pair · checkbox JSX) and differ in nothing but the name. Row 6 is the same
settings sub-object doing it right, in one record with one reducer.

## Decisions this rung takes

**D1 — the rung is a settings-mechanism consolidation, not a walker.** The W6
sketch (`current-contracts-map.md:232`) asks for "derived debug (groups
PASS*GROUP_TITLES + sliders + sections)". Two of the three are already derived or
deliberately not derivable (D2), so what remains is the surface neither the
sketch nor the loose-spot table names: the settings chain behind each debug
toggle. Rungs 3, 4 and 5 all ended the same way — the honest move was to join an
existing mechanism, never to mint a table of layers. Here the existing mechanism
is `disabledPasses`' own shape, described in its own doc comment as *"an
open-world membership record (any layer name) against the closed-world
`CONTENT_LAYERS` registry"_ (`EngineSettingsState.d.ts:420-430`).
\_Cost if wrong:_ a `DEBUG_LAYERS` registry parallel to `CONTENT_LAYERS` that
ships two rows and has to be kept in sync with it by hand — the exact artifact
#13 and #15 rejected twice.

**D2 — the derivation line is data-vs-JSX, and `PASS_GROUP_TITLES` stays
hand-listed.** #4 admits "derived debug" and rejects "Level 4 schema-generated
settings UI" in the same sentence, without drawing the boundary. Drawn here:
**a walker may derive DATA a hand-written component maps over; it may not emit
the component tree.** Everything already shipped sits on the legal side
(`timedSlotRowsOf` → `TIMED_SLOTS` / `TIMED_SLOT_GROUPS` / `groupPassNames`,
`frameProgram.ts:247-293`, consumed by `RenderTogglesSection.tsx:67` and
`GpuTimingsSection`), and so does this rung's `DEBUG_OVERLAY_ROWS`. The
DebugPanel's own section list (`DebugPanel.tsx:82-94`) sits on the illegal side:
**eleven** children — four taking props (a slot map + priority getter, a frame-
stats getter, a timing service, a name list) and seven prop-less store
containers — so no row shape exists, per #10 there is nothing to table, and
generating them is precisely the rejected Level 4.
`PASS_GROUP_TITLES` (`frameProgram.ts:222-238`) is a third case: it is neither
per-layer nor per-subsystem but **per frame step**, and it carries **two** facts,
not one — the many-to-one title merge AND the display ORDER, which is _not_ step
order (`Object.values` order sinks "Composites & pick" last, pinned by
`frameProgram.test.ts:396`). Moving `title` onto the step rows would relocate the
first fact and need a second home for the second — more surface, not less, in
service of a table that accretes one row per new `(target, slab)` step (**12**
rows today) in the one artifact #4 keeps hand-authored on purpose. It stays, and
it stays **as it is**: no new test is added for it. `frameProgram.test.ts:404-412`
already pins the full title list of `TIMED_SLOT_GROUPS` — built from the real
program × the real `CONTENT_LAYERS` (`frameProgram.ts:374-377`) — and `:414-455`
pins four of the groups' row lists, so a renamed or deleted `(target, slab)`
fails today (every render step emits its group-key row unconditionally,
`frameProgram.ts:266-277`, and the raw-key fallback would surface as a new title).
The only drift those miss is a **dead** `PASS_GROUP_TITLES` key matching no
emitted groupKey: its bucket is empty and `groupRows` drops it silently
(`frameProgram.ts:325-328`). That is inert data, not a bug — it changes no
displayed group and no slot — so under `testing.md` it does not earn a test.
_Cost if wrong:_ a schema-driven DebugPanel — the rejected Level 4 arriving
through the back door, and a group-order regression no unit test would explain.

**D3 — no `devOnly` field is added; #7's clause is discharged in another
domain.** `grep -rn devOnly src/` is empty; the token exists only at
`decisions.md:59` and `:567`. Asked what would carry it and what would read it,
the census answers: **two** `ContentLayer` rows could carry it
(`disk-radius-ring`, `clip-path-debug`) and **nothing** would read it. There is
no build-time strip to gate — every `import.meta.env.DEV` use in `src/` is in the
data/loading path, never in `ContentLayer`/`frameProgram`/`GPU_HANDLE_ROWS`, and
the DebugPanel itself ships in production behind the `d` key. The render-toggle
list and the timing list must keep listing debug layers (dropping them removes
DebugPanel capability). The one behaviour it could drive — "off unless asked
for" — is already carried by the settings default. So a `devOnly` flag would be
an optional field one row reads for one polarity: the per-row exception #10 bans
by name. Dev-only-ness is instead carried where it has a reader and more than one
row: **membership in `DEBUG_OVERLAY_ROWS`**, keyed in its own domain per #12.
Absence of a row means "not a dev toggle".
_Cost if wrong:_ a flag on the frame's core row type that no code reads, which
the umbrella reassessment then has to justify or delete.

**D4 — all three booleans keep their capability; none collapses onto
`disabledPasses`.** The census called `showDiskRadiusRing` _"fully redundant
machinery duplicating what `disabledPasses['disk-radius-ring']` already
provides"_. **Contradicted.** Rung 5's D8 test — delete only where the same
mechanism covers the **same fact** — fails on the DEFAULT, not the control:
`disabledPasses` is a one-way override that can only HIDE a layer whose
`enabled()` returned true (`executeFrame.ts:185-196`, and the same words in
`RenderTogglesSection.tsx:18-24`), seeded `{}` = everything on. Deleting the
boolean would ring every selected galaxy in production. `showOrbitTrailImpostor`
fails the same test one step earlier: it is a draw-time ARGUMENT selecting a
second pipeline inside a production layer (`orbitTrailsLayer.ts:326` →
`orbitTrailRenderer.ts:99-102`); the generic mechanism would delete the orbit
trails entirely — a different fact. `showPickBuffer` gates a surface
`disabledPasses` cannot reach at all (D5). So the consolidation is on the
settings CHAIN, which all three share, and explicitly **not** on their
`enabled()` gates, which differ for essential reasons: a live selection
(`diskRadiusRingLayer.ts:43-52`), a computed snapshot
(`clipPathDebugLayer.ts:64-67`), a draw-time branch. A shared "debug gate"
combinator over those is the fake-unified registry #6 forbids.
_Cost if wrong:_ a dev overlay shipping to every explorer who clicks a galaxy —
a visible regression in a behaviour-neutral PR.

**D5 — `pickDebugOverlay`'s second encoder stays; the deferral gets a home, the
REAL reason, and (user-ruled, 2026-08-20) a DESTINATION.** The re-key is all this
rung does to it. Where the deferral points has changed: not "fold one overlay
into `CONTENT_LAYERS` some day" but the user's design target — **pick execution
adopts the frame-program shape: a parallel program instance, same executor and
`(target, slab)` vocabulary, different rows and different targets** — sequenced
as a **new ladder rung** at the umbrella reassessment (#9). The backlog file
(Task 6) carries that target; the audit below is its first evidence, and prices
the one prep refactor it needs. `drawPickDebugOverlay.ts:24-38` says the post-submit
placement is _"a latency choice, not a data dep"_ and that folding it in would
widen `renderFrame`'s input type. Both are true and neither is binding: as a
`ContentLayer` on `(swap, NEAR0)` it would need no encoder, no pass and no swap
view at all (the executor supplies them), the pipeline is depth-less and
swap-formatted so it is pass-compatible, and it would join the timing and toggle
lists for free. What blocks it is a hazard neither file names:
`renderForDebug()` records every pickable layer's `drawPick` and submits
(`pickProgram.ts:304-338`) — run from inside a layer's `draw()`, that submit and
its `queue.writeBuffer` calls land **before** the frame's already-recorded
commands execute, which is exactly the trap `bodyPickRenderer.ts:38-54`
documents ("all `queue.writeBuffer` calls made between passes and submit are
applied … BEFORE the GPU runs any command"), and it was read as breaking the
non-reentrancy discipline `starCatalogLayer.ts:168-175` relies on for its shared
frustum scratch (the audit below narrows that second worry to a placement
condition; the writeBuffer half stands). **Do not read `pickProgram.ts:317-322` as refuting this**: its
"the passes share no mutable buffer — no writeBuffer/submit ordering hazard from
batching them" is scoped to batching slabs _within_ `renderForDebug`; the hazard
here is the OUTER frame, whose commands are recorded but not yet submitted.
Proving the fold safe means auditing every pickable layer's
`drawPick` for buffer sharing with its visual sibling — a renderer-wide audit, not
a behaviour-neutral wiring change. **Home:** a new backlog detail file (Task 6),
because the exhaustive outlier sweep never captured this site — it lists
`pickDebugOverlay` only as a factory-signature outlier
(`renderer-layer-outliers.md:27`), never as an off-program draw.

**That audit has since been run (2026-08-20); the deferral stands, and the
findings become the backlog file's first evidence.** Verdict:
**SAFE-WITH-CONDITIONS**, all twelve pickable rows clean but one. The blocker is
`zoneOfAvoidanceRenderer.ts:70` — a single `uniformBuffer` written by both the
visual `draw` (`:434`) and `drawPick` (`:464`) through one `writeUniforms`
(`:420`), with **different values**: the visual write uses the reduced `zoa`
viewport and the LIVE tween-interpolated `upBasis`, the pick write uses the full
canvas and `ORIENTATION_FRAMES[orientation]` (`helpers/pickFrameContext.ts:74-75`),
so a folded overlay would snap the visible band to the destination roll for a
whole orientation transition. Splitting `drawPick` onto its own buffer + bind
group is ~10 lines in the pattern `galaxyPickRenderer.ts:161` already uses, and
is worth landing on its own as a prep refactor whether or not the fold happens.
Two of this decision's own premises are **corrected** by the audit and must not
be carried forward unamended: pick-texture completeness is a non-issue
(`submit(E2)` precedes `submit(E)`, so the pick textures are complete before the
outer frame samples them — recording order is not execution order), and the
`frustumScratch` re-entrancy worry does not bite **provided** the row sits in the
program's last step, `(swap, NEAR0)` (`frameProgram.ts:164`) immediately before
`clipPathDebugLayer` — every visual `draw` has returned by then, having already
flushed its scratch to the GPU. Two items stay unproven and are conditions, not
findings: Dawn must be observed accepting `queue.submit` from inside an open
render pass on another encoder, and the stacking flip (the clip-path gizmo would
paint OVER the pick overlay instead of under it) is a product call for the user.
_Cost if wrong:_ a dev-only overlay silently corrupting the visible frame
through a mid-record buffer write — the worst class of bug this codebase has, and
invisible to every unit test.

**D6 — hoist out; suspect resolved negative — no gate added (user fold ruling
discharged by verification).** The `FOREGROUND_MAX_DISTANCE_MPC` hoist is not
this rung's, and #7's clause is not executable as written. #7 groups it with `devOnly` in one bullet
(`decisions.md:55-56`): _"moves from ~9 layers' `enabled()` to a gate on the
frame step itself"_. It is not a debug surface, and the premise fails: the **10**
layers that actually gate on it span **at least three different frame steps** —
`foreground:0·NEAR0` (`planetsLayer.ts:86-88` and siblings: earth, rings,
starSpheres, cloudShell, texturedBodies), `hdr·NEAR0`
(`starPointsLayer.ts:138-140`, `orbitTrailsLayer.ts:165-167`,
`bodyGlintsLayer.ts:123-125`) and `swap·NEAR0`
(`foregroundLabelsLayer.ts:342-344`). (Twelve files under `passes/` mention the
token; two are prose only — `starCatalogLayer.ts:68` declares it takes **no**
`FOREGROUND_MAX_DISTANCE_MPC` cut and imports nothing, and
`atmosphereShellLayer.ts:55` describes the shared draw-list's edge. Count 10,
not 12. `renderer-layer-outliers.md:204`'s "`foreground:0` gate ×8" is the count
of `foreground:0` ROWS (8, `rg "target: 'foreground:0'"`), not of gates: only
**6** of them gate explicitly, atmosphereShell gates via the shared draw list,
and `fieldStarSphereLayer.ts:214` does not gate at all — which was
`renderer-layer-outliers.md:165`'s own 🔴, now closed; see below.) The constant's
own header says as much —
_"every NEAR0 foreground layer ANDs [it] into its `enabled`, so all **four**
NEAR0 encoder steps fall away wholesale"_ (`foregroundMaxDistance.ts:2-5`). One
step-level gate cannot host it; four would over-gate every other layer in those
steps (`hdr·NEAR0` also carries the whole star catalog).
**Home:** it already has one — the exhaustive sweep assigned it at
`renderer-layer-outliers.md:204` ("rides rung 2 or the eventual frame-step
work"). Rung 2 shipped without it, so that row is now stale on its first half;
Task 7's sweep re-points it at the frame-step work alone (W5,
`current-contracts-map.md:231`) and corrects the "×8". No new backlog file: an
assignment that exists does not need a second one.

**The `fieldStarSphere` half: RESOLVED NEGATIVE, verified 2026-08-20 — no code
gate is added.** This plan first called the missing gate a bug, and the user
ruled the fix should fold into this rung on that premise. Verification discharged
the premise. The gate is genuinely absent (`fieldStarSphereLayer.ts:217-238`
never reads `ctx.cam`; its test's `makeCtx` has no `cam` field at all), but it is
**redundant by construction**: `enabled()` already requires a catalogued Gaia
star within the hysteresis OFF radius of `ctx.drawCamPos` — measured **1.81 AU**
(7.04e-12 Mpc at the 4.0 px ON threshold, 720 px / 60° fov), roughly **eight
orders of magnitude tighter** than the 0.23 Mpc `FOREGROUND_MAX_DISTANCE_MPC`
cut. A runtime probe against the real octree + catalog shows the suspect's
premise is false: at cosmic zoom (camera 0.5 Mpc from the Sun) `enabled()` is
already **`false`** — `nearestResolvableStar` rejects at the root's expanded box
(`nearestResolvableStar.ts:99-111`) and the hysteresis fallback
(`fieldStarSphereLayer.ts:203`) re-checks the remembered star's own position and
drops it. The step already falls away wholesale. The one pose where the gate
would change anything — camera within 1.8 AU of a star while `cam.distance` ≥
0.23 Mpc — needs an orbit target ≥ 230 kpc from a camera standing at a star,
which no tween or resting base produces (focus tweens move target and distance
together from the live pose, `focusTweenDescriptor.ts`; the resting base is
target `[0,0,0]`, distance 0.43 Mpc). And were it reachable, **today's behaviour
is the desirable one**: a star the camera is 1.5 AU from should have geometry,
and this sphere is its only close-range geometry (the sprite is distance-retired
in-shader, `starCatalog/vertex.wesl:238`). This is precisely the mismatch already
filed as `docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md`
(`FOREGROUND_MAX_DISTANCE_MPC` is derived origin-relative and read
target-relative): `fieldStarSphereLayer` is the one `foreground:0` row whose
predicate is **already** keyed on camera POSITION, so it is that item's
"the permissive reading is what we want" case, reached by construction rather
than by margin. **That backlog file is cited, not modified, by this rung.** The
proportionate remedy is documentary, and it is what ships: a ≤2-line note in
`fieldStarSphereLayer.ts`'s header (Task 6), the 🔴 at `decisions.md:141`
(Task 6) and `renderer-layer-outliers.md:165` (Task 7) closed **RESOLVED
NEGATIVE** in the same idiom the compositor suspect was closed in
(`decisions.md:137-139`), and the verification recorded in decision #16.
_Cost if wrong:_ a "behaviour-neutral" rung that changes what draws at galaxy
zoom across four render steps — or, on the fieldStar half, a gate that blanks the
only geometry a star has at 1.5 AU.

**D7 — the §2/§4 contradiction resolves into three verdicts, and §2 is right.**
`current-contracts-map.md:100,182` calls debug 🟢 ("0 edits for timing slots +
debug toggles — derived"); `:194,210` calls it 🟠 ("Slider tables + DebugPanel
sections + `PASS_GROUP_TITLES` hand-listed"). Both cite the same file. Split:
(a) **timing slots, group buckets, render toggles** — 🟢 derived per LAYER, §2 is
correct and §4's row never disputed it; (b) **slider tables** — 🟠 is **stale**:
`FLOW_SLIDER_FIELDS`, `MILKY_WAY_SLIDER_FIELDS` and
`ZONE_OF_AVOIDANCE_SLIDER_FIELDS` are three registries their sections `.map()`
over (`MilkyWayTuningSection.tsx:43-55`, `FlowTuningSection.tsx:35-47`); what was
left duplicated is the row TYPE (D9 deletes it) and the section COMPONENT itself
(D10 deletes it); (c) **`PASS_GROUP_TITLES` +
DebugPanel sections** — ⚪ deliberate, per D2. After this rung the hand-listed
residue is exactly: **12** `PASS_GROUP_TITLES` rows (pinned by
`frameProgram.test.ts:404-455`), **11** DebugPanel section children, and the
three slider registries' rows — and a new subsystem's
debug cost is **0 edits** for a layer joining an existing step, **1 row** for a
new `(target, slab)` step, **1 row** for a dev toggle. §2's own "+4 more" bullet
(`:101`) is also stale — rung 2 folded clear values onto the spec row, so it is
+3.
_Cost if wrong:_ the next rung's author re-runs this census because the map still
says three things at once.

**D8 — the DEV volume fixtures and the infra knobs stay out.** The three
`debug-*` synthetic cubes are an **asset-supply** concern
(`maybeLazyLoadDebugVolume.ts:17-33`, `wireSlots.ts:118-123`), gated by
`import.meta.env.DEV` and by the same `settings.volumes.items[id].enabled` real
volumes use — not `settings.debug` at all. #14 D4 already examined them in the
ingest family and ruled they carry no `stalenessKey` and produce zero production
rows; nothing about a debug-toggle record changes that. `disabledPasses` and
`renderStrategy` are the two mechanisms this rung's record is modelled on; they
are the answer, not the problem.
_Cost if wrong:_ re-litigating a family #14 closed, and dragging the asset
registry into a settings-surface rung.

**D9 — one `SliderField<K>`; the sketch's `sliders` half, done as a deletion.**
`MilkyWaySliderField.d.ts` and `ZoneOfAvoidanceSliderField.d.ts` are identical
field-for-field and comment-for-comment apart from the key type;
`FlowSliderField.d.ts` is the same plus `surface`. Three instances is past the
second-special-case trigger, and the contract sketch names a single
`SliderField` (`decisions.md:575`). `surface` stays on the flow type alone — it
is one registry's discriminator (two panels), not a shared capability, and
pushing it into the shared shape is the #10 move in reverse.
_Cost if wrong:_ a fourth copy at the next tuning section, and a bundle `debug`
field with three incompatible row types to concatenate.

**D10 — one generic `DebugTuningSection`; user-ruled IN, and it sits on D2's
legal side.** D9 unifies the row TYPE; the three sections still spell the same
COMPONENT three times. `MilkyWayTuningSection.tsx:42-55`,
`FlowTuningSection.tsx:34-47` and `ZoneOfAvoidanceTuningSection.tsx:34-47` are
the same eight props fed to `DebugSlider` inside the same `DebugSection` shell,
differing only in registry, values object and patch fn. That is D9's argument one
level up, and the user ruled it in for this rung. **It does not cross D2's line:**
D2 rejects a walker EMITTING a component tree from a schema; this is a
hand-written component a hand-written caller instantiates with its own data — the
same relationship `DebugSlider` already has to its three callers. What is banned
is generated JSX, not shared JSX.

Shape: `DebugTuningSection` takes `title`, `fields: readonly SliderField<K>[]`,
`values: { [P in K]: number }`, `onSliderChange: (key: K, value: number) => void`
and `children` (rendered after the slider rows), and renders exactly what the
three sections render today. The three keep their files, their props types and
their extras — MW's `CopyButton`, ZoA's two colour-picker rows + `CopyButton`,
which are per-section markup with no row shape and therefore not tabled (#10).
Their bodies become one instantiation plus those children; the `DebugSection`
shell and the `.map()` disappear from all three.

**The flow question, ruled honestly:** `FlowTuningSection` renders **one**
`DebugSection`, over `FLOW_SLIDER_FIELDS.filter(f => f.surface === 'debug')`
(`FlowTuningSection.tsx:30`). The `'panel'` surface is not a second DebugPanel
section at all — it lives in `src/components/SettingsPanel/FlowRow.tsx:45,55-67`,
built from `common/Slider` pills inside `styles.sliderRow`, with a `disabled`
prop the debug rows have no analogue for. So the surface split is already a split
across two COMPONENTS, and `DebugTuningSection` hosts exactly one of them:
`FlowTuningSection` instantiates it **once**, with the pre-filtered rows, and
**`FlowRow.tsx` is not touched by this rung**. Instantiating the generic
component twice, once per surface, would mean rendering the explorer panel's
intensity slider with dev-panel chrome — a visible regression, not a dedupe.
_Cost if wrong:_ a shared component with a `variant` prop bending it toward the
SettingsPanel's chrome — one component serving two design languages, which is the
braid #6 bans, arriving through a props union.

## Findings the executor must know before writing code

1. **`settings` is never persisted** — only the splash version reaches
   `localStorage` (`state/ui/splashStorage.ts`). No migration is needed for the
   shape change, and no tour/clip/URL-hash surface reads
   `settings.debug.show*` (grep-confirmed across `src/`, `tests/`, `tools/`).
2. **Six prose references name the old setting paths** and must move with them
   (`EngineGpuHandles.d.ts:397,408`, `PickDebugOverlay.d.ts:4`,
   `OrbitTrailRenderer.d.ts:31`, `orbitTrailRenderer.ts:99`,
   `shaders/bodies/orbitTrail/fragment.wesl:69`). A half-rename that leaves the
   docs pointing at a deleted field is the failure mode Task 2's grep gate
   exists to catch. The `.wesl` file is a comment-only edit — no shader
   behaviour changes, so no shader probe is needed.
3. **`makeSettingsFixture.ts:179-181` is a shared test fixture** — every consumer
   picks up the shape change at once; `wireInput.test.ts:139-140` and
   `applySceneEffect.test.ts:111-112` build their own inline `debug` literals and
   must be edited by hand.
4. **`diskRadiusRingLayer` has no test file.** Its `enabled()` gate is the one
   read site with no unit coverage; the manual smoke (Task 7) is its only check.
5. **"debug" names three unrelated things** — `settings.debug.*` (gates visual
   layers), `handle.debug.*` (`engine.ts:864-884`, observability getters:
   `timingService`, `frameStats`, `passOverrides`, `assetPriorities`), and
   "debug" in subsystem prose. Only the first is this rung's. Do not rename the
   other two into the record's vocabulary.
6. **`passOverrides.allNames` already lists both debug layers**
   (`engine.ts:879`, `CONTENT_LAYERS.filter((l) => l.target !== 'volume')`), so
   `disk-radius-ring` appears in the Renderer Toggles list today AND has its own
   checkbox. That double control is unchanged by this rung — both are kept, ANDed
   as they are now (D4).
7. **No file moves or renames in this rung.** Should one become necessary it goes
   through `npm run refactor` / `npm run move-files` with `--dry` first.
8. **None of the three tuning sections has a test file** — verified: `tests/`
   contains no `*TuningSection*`, no `DebugSlider` and no `DebugSection` test.
   Their only coverage is `DebugPanel.test.ts`, which mounts the whole panel
   through the containers and asserts nothing about them. **So no test file
   moves in Task 5**, and no existing case changes what it imports or mounts —
   the sections keep their names, their props types and their default exports'
   call sites, so the containers and `DebugPanel.tsx:88-90` are untouched too.
   D10's neutrality gate is therefore a rendered-DOM diff (Task 5), plus the two
   new wiring cases that test the generic component against a FIXTURE registry,
   never the real ones (a test restating `MILKY_WAY_SLIDER_FIELDS` is the
   registry mirror `testing.md` bans).

## The contract

```ts
// src/@types/data/debug/DebugOverlayRow.d.ts — new
/**
 * One developer toggle in the DebugPanel's "Debug Overlays" section: a stable
 * `key` in its own domain (#12) plus the checkbox label. The domain is NOT
 * derived from `CONTENT_LAYERS` — only one of the three toggles is a layer at
 * all. Trap: `'disk-radius-ring'` is byte-identical to `diskRadiusRingLayer.name`
 * and therefore to a `disabledPasses` key, with INVERTED polarity — absent means
 * SHOWN there, `false` means HIDDEN here. Membership in `DEBUG_OVERLAY_ROWS` is
 * what makes a toggle dev-only; there is no `devOnly` flag (decision #16 D3).
 */
export type DebugOverlayRow = { key: string; label: string };
```

```ts
// src/@types/data/debug/DebugOverlayKey.d.ts — new (derived, never hand-listed)
export type DebugOverlayKey = (typeof DEBUG_OVERLAY_ROWS)[number]['key'];
```

```ts
// src/@types/settings/EngineSettingsState.d.ts — three fields become one
debug: {
  /** Dev toggles, one entry per DEBUG_OVERLAY_ROWS row, all seeded false. */
  overlays: Record<DebugOverlayKey, boolean>;
  disabledPasses: Record<string, boolean>;
  renderStrategy: RenderStrategy | 'auto';
  clipPathInspect: {
    /* unchanged */
  }
}
```

```ts
// src/@types/data/SliderField.d.ts — new; the three per-domain types become aliases
export type SliderField<K extends string> = {
  key: K;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  title?: string;
};
```

The record is **full**, not partial: the seed derives an entry per row, so read
sites need no `?? false` and a mistyped key fails `tsc` rather than reading
`undefined` (which is what a plain boolean field buys today and must not be
lost). One reducer `setDebugOverlay({ key, enabled })` replaces three; one
selector `selectDebugOverlays` replaces three.

```tsx
// src/components/DebugPanel/DebugTuningSection.tsx — new (D10)
export type DebugTuningSectionProps<K extends string> = {
  readonly title: string;
  readonly fields: readonly SliderField<K>[];
  /** The settings cluster; only the row keys are read, all numeric. */
  readonly values: { [P in K]: number };
  readonly onSliderChange: (key: K, value: number) => void;
  /** Per-section extras rendered AFTER the rows (copy button, colour pickers). */
  readonly children?: ReactNode;
};
```

`values` is typed as the mapped object rather than the settings type so a section
can pass its whole cluster (`MilkyWaySettings` has non-numeric leaves; only the
`SliderField` keys are read). `onSliderChange` takes `(key, value)` rather than a
patch, so each section keeps its own `*SliderPatch` helper and its own
`onChange` prop type — the patch shape is per-domain and does not belong in
shared chrome.

## Tasks

**Execution order (binding).** Task 1 → 2 → 3 are one mechanism change in three
commits (data+state, engine read sites + prose, UI) on one branch, and the two
intermediate commits are **knowingly red** — Task 1 leaves `tsc` failing at the
read sites and the container, Task 2 leaves it failing at the container. That is
accepted, not optional: the PR squash-merges, so no red commit ever reaches
`main` and nothing is bisect-poisoned. Do **not** widen a task to make an
intermediate green. Task 4 (type dedupe) is independent and may run any time
after Task 3. **Task 5 (the generic `DebugTuningSection`) must run after Task 4**
— it is typed on `SliderField<K>`, and running it first would mean writing the
generic component against three incompatible row types and then editing it again.
Tasks 6–7 close.

### Task 1 — Mint `DEBUG_OVERLAY_ROWS` + the settings record (TDD)

**Files:** `src/@types/data/debug/DebugOverlayRow.d.ts`,
`src/@types/data/debug/DebugOverlayKey.d.ts`,
`src/data/debug/debugOverlayRows.ts` (create);
`src/@types/settings/EngineSettingsState.d.ts`, `src/data/defaults.ts`,
`src/state/settings/initialState.ts`, `src/state/settings/settingsSlice.ts`,
`src/state/settings/selectors.ts` (modify);
`tests/state/settings/makeSettingsFixture.ts` (modify)

- [x] Write the failing test first in
      `tests/state/settings/settingsSlice.test.ts` (or the nearest existing debug
      case): dispatching `setDebugOverlay({ key: 'pick-buffer', enabled: true })`
      flips exactly that entry and leaves the other two false. This is the one
      new unit test the rung adds — it fails on a real bug (a reducer that
      replaces the record instead of writing one entry, the Immer in-place trap
      from `project_landmines_state`). No test is added for the selector or the
      seed: both are derivations that cannot drift (`testing.md`).
- [x] Create the three files: `DEBUG_OVERLAY_ROWS` holds exactly three rows —
      `{key:'pick-buffer', label:'Show pick buffer'}`,
      `{key:'disk-radius-ring', label:'Show disk radius ring'}`,
      `{key:'orbit-trail-impostor', label:'Show orbit-trail impostor'}` — the
      labels copied verbatim from `DebugOverlaysSection.tsx:41,49,57`, declared
      `as const satisfies readonly DebugOverlayRow[]` so the key union derives.
- [x] `EngineSettingsState.d.ts`: replace `:432-434` with the single `overlays`
      field, and fold the three per-field doc paragraphs (`:406-419`) into ≤4
      lines that point at `DEBUG_OVERLAY_ROWS` for the roster. The
      `disabledPasses` paragraph (`:420-430`) is untouched — it is the doc that
      already states the shape this change adopts — except for one added clause
      naming the sibling trap: the two records have **opposite defaults** (D4)
      AND share the token `'disk-radius-ring'`, which is a `ContentLayer.name`
      (`diskRadiusRingLayer.ts:38`) in `disabledPasses` and an overlay key here,
      absent-means-shown there vs `false`-means-hidden here.
- [x] Delete `DEFAULT_SHOW_PICK_BUFFER` / `DEFAULT_SHOW_DISK_RADIUS_RING` /
      `DEFAULT_SHOW_ORBIT_TRAIL_IMPOSTOR` (`defaults.ts:482-488`, with their doc
      lines) — the seed derives `false` per row, so a constant per toggle has no
      job left.
- [x] `initialState.ts:250-252` → one line seeding from the rows, inline
      `Object.fromEntries(...)` with the cast, matching `bodies.items`'
      registry-derived seed twenty-one lines above (`:229-236`).
- [x] `settingsSlice.ts:352-360` → one `setDebugOverlay` reducer writing
      `settings.debug.overlays[action.payload.key] = action.payload.enabled`
      (in-place, like `setPassDisabled` directly below it). Update the three
      export entries at `:538-540` — collapsing the reducers first shifts them
      up by two, so re-locate by name, not by line.
- [x] `selectors.ts:228-235` → one `selectDebugOverlays` returning the record,
      placed beside `selectDisabledPasses` (`:237-238`).
- [x] `makeSettingsFixture.ts:179-181` → the derived seed.
- [x] `npm run typecheck` will fail at the three read sites and the container —
      that is expected and Task 2/3 close it (see the binding execution order).
      Do **not** patch them here beyond what compiles; keep the commit boundary.
- [x] Commit.

### Task 2 — Re-key the three engine read sites + the prose that names them

**Files:** `src/services/engine/frame/passes/diskRadiusRingLayer.ts`,
`src/services/engine/frame/drawPickDebugOverlay.ts`,
`src/services/engine/frame/passes/orbitTrailsLayer.ts`,
`src/@types/engine/handles/EngineGpuHandles.d.ts`,
`src/@types/rendering/PickDebugOverlay.d.ts`,
`src/@types/rendering/OrbitTrailRenderer.d.ts`,
`src/services/gpu/renderers/bodies/orbitTrailRenderer.ts`,
`src/services/gpu/shaders/bodies/orbitTrail/fragment.wesl` (modify);
`tests/services/engine/frame/drawPickDebugOverlay.test.ts`,
`tests/services/engine/frame/passes/orbitTrailsLayer.test.ts`,
`tests/services/gpu/renderers/bodies/orbitTrailRenderer.test.ts`,
`tests/services/engine/phases/wireInput.test.ts`,
`tests/services/animation/applySceneEffect.test.ts` (modify)

The three read sites keep their exact gate logic — only the path changes. The
existing tests keep their exact cases and expectations and only change what they
seed (`orbitTrailsLayer.test.ts:168-176,578,587` is the pattern: the impostor
arg assertion is unchanged, the state builder's field moves).

**Test-local identifiers are in scope for the rename**, not only seeded fields:
`drawPickDebugOverlay.test.ts` names a local option `showPickBuffer`
(`:103,109,112,136,139`) that is not a settings path at all, and
`orbitTrailRenderer.test.ts:233` names the old path in a comment. Both must move
or the zero-hits gate below cannot pass.

- [x] `diskRadiusRingLayer.ts:49` → `overlays['disk-radius-ring']`; the header's
      "Gated on `state.settings.debug.showDiskRadiusRing`" line (`:7-9`) moves
      with it. The three ANDed conditions stay as they are (D4).
- [x] `drawPickDebugOverlay.ts:76` → `overlays['pick-buffer']`; the two docblock
      mentions (`:7`, `:61-66`) move with it. **Nothing else in this file
      changes** — the encoder stays (D5).
- [x] `orbitTrailsLayer.ts:326` → `overlays['orbit-trail-impostor']` as the
      fourth positional argument, unchanged in kind.
- [x] The four prose sites in finding 2, plus the `.wesl` comment line, name the
      new path; so do `orbitTrailRenderer.test.ts:233`'s comment and
      `drawPickDebugOverlay.test.ts`'s local option name and its header
      (`:6,103`).
- [x] `grep -rn "showPickBuffer\|showDiskRadiusRing\|showOrbitTrailImpostor" src/ tests/`
      → hits remain in **exactly three files**, all Task 3's:
      `DebugOverlaysSection.tsx`, `DebugOverlaysSectionContainer.tsx`,
      `DebugPanel.test.ts`. Anything else surviving is either a missed read site
      (a dev toggle silently dead) or a doc pointing at a deleted field. Task 3
      takes this to zero.
- [x] `npm run typecheck` + `npm test -- drawPickDebugOverlay orbitTrail wireInput applySceneEffect`
      (the `orbitTrail` prefix picks up both the layer and the renderer test).
- [x] Commit.

### Task 3 — Row-drive the DebugPanel section + collapse its container

**Files:** `src/components/DebugPanel/DebugOverlaysSection.tsx`,
`src/components/containers/DebugOverlaysSectionContainer.tsx` (modify);
`tests/components/DebugPanel/DebugPanel.test.ts` (modify)

Load the `create-component` skill before editing either file. The section stays
a hand-written component with hand-written chrome — only its ROWS come from data
(D2), the same shape `MilkyWayTuningSection.tsx:43-55` uses for sliders.

- [x] Rewrite **both** DebugPanel overlay cases against the new dispatch and
      selector, keeping the same checkbox label and the same assertions — same
      bugs caught, new plumbing. The two cases are
      `reflects showPickBuffer from the store` (`:82-94`, store → checkbox) and
      `dispatches setShowPickBuffer on checkbox toggle` (`:96-106`, checkbox →
      store, asserting via `selectShowPickBuffer`). Their imports (`:29,33`) and
      the file header's two bullets (`:8-9`) name the old symbols and move with
      them. Run them first and watch them fail.
- [x] `DebugOverlaysSection.tsx`: props become
      `{ overlays: Record<DebugOverlayKey, boolean>; onToggle: (key: DebugOverlayKey, enabled: boolean) => void }`;
      the three `<label>` blocks (`:35-58`) become one `.map()` over
      `DEBUG_OVERLAY_ROWS` keyed by `row.key`. The header's three-sentence
      description of what each toggle does moves to the rows table (one
      comment), leaving the header ≤6 lines. The `.module.css` is untouched.
- [x] `DebugOverlaysSectionContainer.tsx`: one `useAppSelector` +
      one `useCallback`, replacing `:12-51`. ~57 lines → ~30.
- [x] `grep -rn "showPickBuffer\|showDiskRadiusRing\|showOrbitTrailImpostor" src/ tests/`
      → **zero hits** now, including doc comments, test-local identifiers and the
      `.wesl` line. `docs/` is deliberately excluded — decisions.md and this plan
      record the old names as history.
- [x] `npm run typecheck` + `npm test -- DebugPanel`.
- [x] Commit.

### Task 4 — One `SliderField<K>` (type dedupe, typecheck-gated)

**Files:** `src/@types/data/SliderField.d.ts` (create);
`src/@types/data/milkyWay/MilkyWaySliderField.d.ts`,
`src/@types/data/zoneOfAvoidance/ZoneOfAvoidanceSliderField.d.ts`,
`src/@types/data/flow/FlowSliderField.d.ts` (modify)

No test: this is a type-only change with no runtime shape, and a test asserting
it would be the runtime type test `testing.md` bans. `npm run typecheck` is the
gate — the three data registries and the four consuming components must compile
untouched, which is the whole claim.

- [x] Create `SliderField<K extends string>` carrying the six shared fields +
      optional `title`, with the doc lines the three copies already share
      (min/max/step/title wording lifted verbatim — identical today). One
      discrepancy to settle rather than stall on: `format`'s doc differs —
      MW/ZoA say "Pre-format the current value for the readout."
      (`MilkyWaySliderField.d.ts:17`, `ZoneOfAvoidanceSliderField.d.ts:18`) and
      flow adds an example (`FlowSliderField.d.ts:15`). Take the **flow**
      wording: it is a superset and true of all three.
- [x] The three types become one-line aliases:
      `MilkyWaySliderField = SliderField<MilkyWaySliderKey>`,
      `ZoneOfAvoidanceSliderField = SliderField<ZoneOfAvoidanceSliderKey>`,
      `FlowSliderField = SliderField<FlowSliderKey> & { surface: FlowSliderSurface }`.
      Each keeps its file and its exported name (one type per file); each keeps
      only the doc line that is true of IT and not of the shared shape.
- [x] `npm run typecheck` (both tsconfigs) — **no other file changes**. Any
      required edit in `src/data/*` or `src/components/*` means the shapes were
      not identical and the finding belongs in decision #16 before proceeding.
- [x] Commit.

### Task 5 — One generic `DebugTuningSection` (D10, behaviour-neutral)

**Files:** `src/components/DebugPanel/DebugTuningSection.tsx`,
`tests/components/DebugPanel/DebugTuningSection.test.ts` (create);
`src/components/DebugPanel/MilkyWayTuningSection.tsx`,
`src/components/DebugPanel/FlowTuningSection.tsx`,
`src/components/DebugPanel/ZoneOfAvoidanceTuningSection.tsx` (modify)

**Runs after Task 4** — the component is typed on `SliderField<K>`.
Load the `create-component` skill before writing the file. **Name:**
`DebugTuningSection`, not `TuningSection` — its neighbours in this flat folder
are `DebugSection` / `DebugSlider` (the shared chrome is `Debug`-prefixed), and a
bare `TuningSection` reads as a fourth sibling of the three `*TuningSection`s
rather than the thing they instantiate. Flat file, `function` declaration +
`export default`, **no `.module.css`** — it renders no chrome of its own; every
className still comes from `DebugSection`/`DebugSlider` (which is also why the
DOM can be identical).

**No test file moves** (finding 8: none of the three sections has one). The three
containers, their props types and `DebugPanel.tsx:88-90` are untouched.

- [x] **Capture the neutrality baseline first**: render each of the three
      sections with a fixed props fixture and save the `outerHTML` of each to the
      scratchpad (not the repo). This is the gate the task is judged on — after
      the refactor the three re-renders must diff **empty**: same tag order, same
      `className`s, same `aria-label`/`title`/`value`/`min`/`max`/`step`, same
      `<details>`/`<summary>` nesting, same position of MW's copy button and
      ZoA's two colour rows relative to the slider rows.
- [x] Write the failing test in `tests/components/DebugPanel/DebugTuningSection.test.ts`
      against a **two-row fixture registry**, never a real one. Two cases, both
      of which fail on a real bug no compiler check catches: (1) moving the
      SECOND row's range input calls `onSliderChange` with **that** row's key and
      the numeric value — the classic closure-over-the-loop-row bug, and the one
      way a generic mapper silently rewires every knob to the first field; (2)
      `children` render **after** the last slider row — ZoA's colour pickers and
      copy button must not float above the sliders. Nothing asserts the shape or
      contents of `MILKY_WAY_SLIDER_FIELDS` et al. (registry mirror, banned).
- [x] Create `DebugTuningSection.tsx` to the contract sketch above: one
      `DebugSection title` wrapping `fields.map(...)` → `DebugSlider` with
      `key`/`label`/`value=values[f.key]`/`min`/`max`/`step`/
      `readout=f.format(values[f.key])`/`title`, then `{children}`. Header ≤6
      lines: why it exists (three identical boards), and the one non-obvious
      thing — `children` land after the rows, and the SettingsPanel's flow
      sliders are deliberately NOT hosted here (D10).
- [x] `MilkyWayTuningSection.tsx` → the `diff` line plus one
      `DebugTuningSection` element: title `Milky Way tuning`, fields
      `MILKY_WAY_SLIDER_FIELDS`, values `milkyWay`, and
      `onSliderChange={(k, v) => onChange(milkyWaySliderPatch(k, v))}`, with the
      existing `CopyButton` as its child. The header loses the
      rows-driven-from-the-registry paragraph (now the shared component's fact)
      and keeps the copy-button paragraph.
- [x] `ZoneOfAvoidanceTuningSection.tsx` → the same, title
      `Zone of Avoidance tuning`, fields `ZONE_OF_AVOIDANCE_SLIDER_FIELDS`, with
      the two colour rows **and** the `CopyButton` as children, in that order,
      markup and `sliderStyles` classNames unchanged.
- [x] `FlowTuningSection.tsx` → one instantiation, title `Flow tuning`, fields
      `DEBUG_SLIDERS` (the existing module-level `surface === 'debug'` filter
      stays where it is), no children. **`SettingsPanel/FlowRow.tsx` is
      NOT touched** — D10's flow ruling; a second instantiation there would
      render the explorer panel in dev-panel chrome.
- [x] Re-render the three sections and diff against the saved baseline —
      **empty diff, or the task is not done**. Then `npm run typecheck` +
      `npm test -- DebugTuningSection DebugPanel`.
- [x] Commit.

### Task 6 — decision #16, the D5 backlog file, and the fieldStar closure

**Files:** `docs/research/engine/decisions.md`,
`docs/backlog/2026-08-20-pick-debug-overlay-off-program.md` (create),
`docs/BACKLOG.md`,
`src/services/engine/frame/passes/fieldStarSphereLayer.ts` (modify)

The one code edit here is comment-only and belongs with the ruling it records
(D6's fieldStar half): the layer note and `decisions.md:141`'s closure are two
halves of one fact and should not land in different commits.

**Edit decisions.md in DESCENDING line order** — every insertion shifts every
line below it, and #16 lands above the P1/P2 bullets. Do the five in-place
amendments from the bottom up, then insert #16 last, or target by anchor text.
(#16's insertion point, `:558`, sits above `:585`/`:581` and below `:141`/`:106`/
`:59`/`:55`, so the P-bullets must be done before it and the #7/#9/#11 clauses
after it — or use anchor text and stop counting.)

- [x] **P2** (`decisions.md:585-590`): close the "the debug-maps deletion is
      still open" clause — #16 is what closes it (the maps stay; D2 rules why).
- [x] **P1** (`decisions.md:581-582`): the deliverable reads "derived debug incl.
      PASS_GROUP_TITLES + TIMED_SLOTS". `TIMED_SLOTS` already shipped;
      `PASS_GROUP_TITLES` is ruled permanently hand-listed. Strike that half in
      place with a "**REFINED by #16 (2026-08-20)**" marker, in the same idiom
      the bullet's existing "**SUPERSEDED by #13**" uses.
- [x] **#9's rung-6 clause** (`decisions.md:106-107`): amend in place in the
      style #13/#14/#15 use ("**6** ~~debug derivation~~ **REFINED by #16
      (2026-08-20)** — …"), so a reader of #9 alone does not expect a
      derived-debug walker.
- [x] **#7's `devOnly` clause** (`decisions.md:59-60`) and **#7's step-gate
      clause** (`decisions.md:55-56`): both promise what D3 and D6 reject. Mark
      each "**REFINED by #16 (2026-08-20)**" in place — `devOnly` rejected with
      its reason, the `FOREGROUND_MAX` hoist re-pointed at the frame-step work
      with its corrected span. A reader of #7 alone must not still expect them.
- [x] **#11's bug-suspect list** (`decisions.md:141`): "fieldStarSphere missing
      the FOREGROUND_MAX gate" becomes **RESOLVED NEGATIVE**, struck and
      annotated in the exact idiom the compositor suspect above it uses
      (`:137-139`) — self-gated on camera POSITION at ~1.81 AU, ~8 orders tighter
      than the 0.23 Mpc cut; `enabled()` measured `false` at cosmic zoom; the
      only divergent pose is unreachable and current behaviour would be the
      correct one there anyway. Cite the residual as the standing backlog item
      `2026-07-30-camera-target-vs-origin-distance-gates.md` (cite only — **do
      not edit that file**).
- [x] `fieldStarSphereLayer.ts`: **≤2 comment lines** at the end of the
      "Presence is PROXIMITY, not selection" header section (after `:27`) —
      that the layer takes no `FOREGROUND_MAX_DISTANCE_MPC` cut because the
      resolve-radius proximity test on `ctx.drawCamPos` already subsumes it by
      ~8 orders of magnitude. Same purpose as `starCatalogLayer.ts:68`'s note,
      which is the precedent for documenting a deliberate absence. **No `enabled()`
      change, no import added** — the diff is comment-only.
- [x] Add **decision #16** (before `## The contract`, `decisions.md:558`)
      recording D1–D10 with their citations: the census table, the data-vs-JSX
      line and why `PASS_GROUP_TITLES` stays (both facts it carries, and that
      `frameProgram.test.ts:404-455` already pins it — **no new test was
      added**), the `devOnly` rejection and where dev-only-ness lives instead,
      the same-fact test applied to all three booleans (and the census claim it
      contradicts), the pick-overlay deferral with the writeBuffer reason **and**
      the note that `pickProgram.ts:317-322`'s "no ordering hazard" is scoped to
      batching within `renderForDebug`, not the outer frame, **plus the user's
      design target for it — pick execution as a parallel frame-program instance,
      a new ladder rung sequenced at the umbrella reassessment — and the audit
      that priced it** (SAFE-WITH-CONDITIONS; one blocker,
      `zoneOfAvoidanceRenderer.ts:70`'s shared uniform; two of this plan's own
      premises corrected: pick-texture completeness is a non-issue and the
      re-entrancy worry is placement-contingent), the `FOREGROUND_MAX` finding
      (**10** gating layers across three steps — not 12, and
      `starCatalogLayer.ts:68` is the counter-example that declares no cut),
      **the fieldStarSphere verification and its RESOLVED-NEGATIVE closure — the
      measured numbers, the probe result, and that no gate was added**, D10's
      generic `DebugTuningSection` (why it is on D2's legal side, and why the
      SettingsPanel's flow sliders stay out), the §2/§4 resolution, and the
      closing line rungs 7+ read: **no walker, no layer registry, no `devOnly`
      field was built.**
- [x] New backlog detail file for D5 — **it carries the design target, not just
      the deferral**: (a) the user's target shape — pick execution adopts the
      frame-program shape, a parallel program instance, same executor and
      `(target, slab)` vocabulary, different rows and different targets — as a
      **new ladder rung** sequenced at the umbrella reassessment; (b) the site
      today (`runFrame.ts:697`, own encoder + submit, `drawPickDebugOverlay.ts`)
      and why it is off-program; (c) the 2026-08-20 audit as first evidence:
      overall **SAFE-WITH-CONDITIONS**, eleven of twelve pickable rows clean;
      **blocker** — `zoneOfAvoidanceRenderer.ts:70`'s single `uniformBuffer`
      written by `draw` (`:434`) and `drawPick` (`:464`) via one `writeUniforms`
      (`:420`) with different values (reduced `zoa` viewport vs full canvas; live
      tweened `upBasis` vs `ORIENTATION_FRAMES`), so the band would snap to the
      destination roll through an orientation transition — the own-pick-buffer
      split is ~10 lines in the `galaxyPickRenderer.ts:161` pattern and **is a
      valid prep refactor on its own merits**; (d) the conditions — the row must
      sit in `(swap, NEAR0)` immediately before `clipPathDebugLayer` or the
      `frustumScratch` re-entry hazard reopens, Dawn must be runtime-verified to
      accept `queue.submit` from inside an open render pass on another encoder,
      and the gizmo-over-overlay stacking flip needs the user's acceptance;
      (e) pick-texture completeness is **fine** — `submit(E2)` precedes
      `submit(E)`; (f) what it buys (timing slot + toggle row + one fewer
      swap-chain acquisition + ~110 deleted lines). Index line in
      `docs/BACKLOG.md`'s **Rendering** section (`:65`) — title + readiness tag +
      one clause + the details link, nothing more (backlog hygiene). D6 gets
      **no** backlog file: its assignment already exists at
      `renderer-layer-outliers.md:204` and Task 7 re-points it.
- [x] Commit.

### Task 7 — Doc sweep + full gate + visual smoke

**Files:** `docs/research/engine/current-contracts-map.md`,
`docs/research/engine/engine-composition-map.md`,
`docs/research/engine/renderer-layer-outliers.md` (modify as the sweep finds)

- [x] `current-contracts-map.md`, **edited in descending line order** (each edit
      shifts the lines below it): §7's table row (`:259`) and W6 node (`:232`)
      record the ruling — one settings record + one rows table, no walker — and
      the "a new subsystem stops touching" column becomes "the three-chain
      settings copy"; §6's rank-5 row (`:210`) is re-coloured ⚪ with the reason;
      the §4 loose-spot row (`:194`) splits into the three verdicts of D7 (stale
      / deliberate / test-pinned) **and its evidence cell is re-cited in the same
      edit** — it currently points at `DebugPanel.tsx:79-90` and
      `frameProgram.ts:209-224`, which are now `:82-94` and `:222-238`; the §4
      contract row (`:182`) gains the settings half; §2's "+4 more" bullet
      (`:101`) drops the clear-value entry rung 2 already deleted and re-points
      the `PASS_GROUP_TITLES` entry at "a new (target, slab) step, not a new
      subsystem".
- [x] `renderer-layer-outliers.md`, **descending order — `:204` before `:165`**:
      the 🟢 "`foreground:0` gate ×8" row (`:204`) re-points "rides rung 2 or the
      eventual frame-step work" at the frame-step work alone — rung 2 shipped
      without it — and corrects the count per D6 (8 is the `foreground:0` ROW
      count; **6** of those gate explicitly, 10 layers gate across three steps,
      and `fieldStarSphereLayer` gates not at all, **by design — see `:165`**).
      This row is D6's home; no backlog file is created for it.
- [x] `renderer-layer-outliers.md:165` (the 🔴 "`fieldStarSphereLayer` has no
      `FOREGROUND_MAX` gate" suspect): **closed RESOLVED NEGATIVE**, matching
      `decisions.md:141`'s wording from Task 6 — the layer self-gates on camera
      POSITION at ~1.81 AU, ~8 orders tighter than the 0.23 Mpc cut, and
      `enabled()` was measured `false` at cosmic zoom. Its "cheap check" cell
      ("diff its gate against the other ~8 … looks like omission, not choice")
      is replaced by the verification's result, and the residual is pointed at
      `docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md` (cite
      only; that file is not edited). Leave §5's other rows alone — the
      compositor row is still 🔴 here although `decisions.md:137-139` closed it,
      and the stale-shader-docs row is untouched by this rung; neither is a
      claim this rung made stale.
- [x] Grep the other two maps for debug/slider/`PASS_GROUP_TITLES` claims this
      rung makes stale and fix them in the same edit; leave rows this rung did
      not touch alone. Note the grep tokens do **not** reach the
      `renderer-layer-outliers.md:204` row — that edit is the bullet above, not
      a sweep find.
- [x] `npm run typecheck` (both tsconfigs) + `npm test` — green, no skips added.
- [x] `npm run build` — the DebugPanel section/container edits and the four
      tuning-section files are the only React churn; a Vite build catches an
      unresolved import the unit tests would not.
- [x] Dev-server smoke, **with the user's eyes** (press `d` for the panel):
  1. **Debug Overlays** shows exactly three checkboxes, same labels, same order,
     all unchecked on a fresh load.
  2. **Show pick buffer** on → the colour-mapped pick overlay paints over the
     scene; off → gone. (The one check that proves the D5 deferral kept the
     post-submit encoder working.)
  3. Select a famous galaxy (M31), **Show disk radius ring** on → the ring
     appears around it; deselect → the ring goes; reload → the checkbox is
     **off** again (the default polarity D4 turns on).
  4. Zoom to the solar system with orbit trails visible, **Show orbit-trail
     impostor** on → the ribbon hull tint appears; off → normal trails.
  5. **Renderer Toggles**: the group titles and their order are unchanged —
     Volumes & aggregates · Cosmos · HDR · Near field · HDR · Foreground bodies ·
     depth · Bloom · Overlays — and `disk-radius-ring` is still listed under
     Overlays.
  6. Reload with `?gpuTimings`: **GPU timings** shows the same groups with
     **Composites & pick LAST** (the display-order fact D2 rests on).
  7. **Flow tuning · Milky Way tuning · Zone of Avoidance tuning** all look and
     behave exactly as before (D10): same section titles and open/closed
     behaviour, same row order and labels, every slider drags and its readout
     re-formats live, ZoA's two colour pickers still sit below the sliders and
     still round-trip a tint, both copy buttons still copy. And in the
     **explorer** panel (not the dev panel), the flow **Intensity** slider is
     unchanged — still the pill `Slider`, still disabled while flow is off:
     the two surfaces stayed two components.
  8. Nothing else in the panel changed: no new rows, no missing section.

- [x] Commit (if any smoke-driven fixes were needed).

## Global Constraints

- **Behaviour-neutral PR** (#9), and the amendments did not change that. Same
  pixels, same DebugPanel capabilities. The three toggles keep their labels,
  their defaults and their effects; no checkbox is removed, none is added, and no
  layer's `enabled()` logic changes — including `fieldStarSphereLayer`, which
  gains a comment and **no `FOREGROUND_MAX_DISTANCE_MPC` gate** (D6). A diff that
  makes a dev overlay default-on has failed the rung.
- **The `DebugTuningSection` extraction is behaviour-neutral at the DOM.** The
  bar is not "looks the same": the three sections' rendered markup must be
  IDENTICAL — tag order, `className`s, `aria-label`/`title`, every
  `min`/`max`/`step`/`value`, and the position of the extras relative to the
  slider rows. Gate it the way Task 5 specifies: a rendered-`outerHTML` diff
  against a baseline captured before the edit (scratchpad, not the repo), plus
  the two prop-level wiring assertions on the new component. If the diff is
  non-empty, the extraction is wrong — do not adjust the baseline.
- **Test edits preserve what-can-break coverage.** Every existing test keeps its
  cases and expectations and changes only how it seeds or dispatches. **No test
  of surviving behaviour is removed, and no assertion is deleted** — unlike rung
  5, this rung deletes no code path that an assertion pinned. Exactly **three**
  tests are added: Task 1's reducer case and Task 5's two wiring cases (against a
  fixture registry, never a real one). No test file is moved or deleted.
- **One concern per commit** — data+state, engine read sites+prose, UI, type
  dedupe, the generic tuning section, decisions+backlog (+ the one comment-only
  layer note), doc sweep. Stage by explicit path; never `git add -A`.
- **No new mechanism without ≥2 rows** (#13's method, #14/#15's precedent): no
  `DEBUG_LAYERS` registry, no walker, no `devOnly` field, no shared "debug gate"
  combinator. `DEBUG_OVERLAY_ROWS` ships **three** rows with a live reader on
  each; that is the bar it clears.
- **Didactic comment budget** — module headers ≤10 lines, comment lines ≤half the
  code lines. This rung's net comment count should FALL: three per-field doc
  paragraphs and three section-header sentences collapse into one rows table.
  Reasoning belongs in decision #16, not inlined. Do not read this as licence to
  trim unrelated comments.
- **UNTOUCHABLE invariants** — a diff that moves any of these has drifted:
  1. `disabledPasses` stays a **one-way** override applied AFTER each layer's own
     `enabled()` (`executeFrame.ts:185-196`); the new record must never gain the
     power to force-enable a layer.
  2. `clipPathDebugLayer` stays **last** among the `(swap, NEAR0)` rows
     (`passes/index.ts:363-370`) — its route and gizmo draw on top of every other
     overlay.
  3. `drawPickDebugOverlay` keeps its own encoder, its `loadOp: 'load'` and its
     post-`renderFrame` call site (`runFrame.ts:697`). D5 is a deferral, not a
     licence to start the fold.
  4. `PASS_GROUP_TITLES` (`frameProgram.ts:222-238`) is untouched, and its
     **value order** fixes the display group order (`frameProgram.ts:314`);
     reordering the object literal reorders two DebugPanel lists.
  5. The derived timing/toggle walk (`frameProgram.ts:247-293`) is untouched — it
     is the half of "derived debug" that already works.
  6. `fieldStarSphereLayer`'s `enabled()` (`:217-238`) is untouched and imports
     nothing new — the D6 verification ruled the gate redundant, so the diff on
     this file is ≤2 comment lines or it has drifted.
  7. `src/components/SettingsPanel/FlowRow.tsx` is untouched — D10 hosts only the
     dev-panel surface.
- **Shader files are comment-only in this rung** (`fragment.wesl:69`); no `.wesl`
  behaviour changes, so no probe run is required.

## File Structure

**Created:**

- `src/@types/data/debug/DebugOverlayRow.d.ts`
- `src/@types/data/debug/DebugOverlayKey.d.ts`
- `src/@types/data/SliderField.d.ts`
- `src/data/debug/debugOverlayRows.ts`
- `src/components/DebugPanel/DebugTuningSection.tsx` — no `.module.css`: it
  renders no chrome of its own (D10).
- `tests/components/DebugPanel/DebugTuningSection.test.ts`
- `docs/backlog/2026-08-20-pick-debug-overlay-off-program.md`

**Modified:**

- `src/@types/settings/EngineSettingsState.d.ts` — three fields → one record.
- `src/data/defaults.ts` — three `DEFAULT_SHOW_*` constants deleted.
- `src/state/settings/initialState.ts`, `settingsSlice.ts`, `selectors.ts` — one
  seed, one reducer, one selector.
- `src/services/engine/frame/passes/diskRadiusRingLayer.ts`,
  `src/services/engine/frame/drawPickDebugOverlay.ts`,
  `src/services/engine/frame/passes/orbitTrailsLayer.ts` — read sites re-keyed.
- `src/@types/engine/handles/EngineGpuHandles.d.ts`,
  `src/@types/rendering/PickDebugOverlay.d.ts`,
  `src/@types/rendering/OrbitTrailRenderer.d.ts`,
  `src/services/gpu/renderers/bodies/orbitTrailRenderer.ts`,
  `src/services/gpu/shaders/bodies/orbitTrail/fragment.wesl` — prose only.
- `src/components/DebugPanel/DebugOverlaysSection.tsx`,
  `src/components/containers/DebugOverlaysSectionContainer.tsx` — row-driven.
- `src/@types/data/milkyWay/MilkyWaySliderField.d.ts`,
  `src/@types/data/zoneOfAvoidance/ZoneOfAvoidanceSliderField.d.ts`,
  `src/@types/data/flow/FlowSliderField.d.ts` — aliases.
- `src/components/DebugPanel/MilkyWayTuningSection.tsx`,
  `src/components/DebugPanel/ZoneOfAvoidanceTuningSection.tsx`,
  `src/components/DebugPanel/FlowTuningSection.tsx` — one
  `DebugTuningSection` instantiation each, extras as children (D10). Their
  props types, exported names and call sites are unchanged, so the three
  containers and `DebugPanel.tsx` are **not** in this list.
- `src/services/engine/frame/passes/fieldStarSphereLayer.ts` — ≤2 header
  comment lines (D6); no code change.
- `tests/state/settings/makeSettingsFixture.ts`,
  `tests/state/settings/settingsSlice.test.ts`,
  `tests/components/DebugPanel/DebugPanel.test.ts`,
  `tests/services/engine/frame/drawPickDebugOverlay.test.ts`,
  `tests/services/engine/frame/passes/orbitTrailsLayer.test.ts`,
  `tests/services/gpu/renderers/bodies/orbitTrailRenderer.test.ts`,
  `tests/services/engine/phases/wireInput.test.ts`,
  `tests/services/animation/applySceneEffect.test.ts`.
- `docs/research/engine/decisions.md`, `current-contracts-map.md`,
  `engine-composition-map.md`, `renderer-layer-outliers.md`,
  `docs/BACKLOG.md`.

**Deleted:** none (three type BODIES collapse into aliases; no file is removed).

## Definition of Done

- [x] `grep -rn "showPickBuffer\|showDiskRadiusRing\|showOrbitTrailImpostor" src/ tests/`
      → **zero hits**, including doc comments and the `.wesl` line. The rename is
      total or it is a landmine.
- [x] `settings.debug` carries **one** `overlays` record beside `disabledPasses`,
      with **one** reducer and **one** selector; `defaults.ts` carries **no**
      `DEFAULT_SHOW_*` constant; and `DEBUG_OVERLAY_ROWS` has a live reader for
      every one of its three rows.
- [x] `DebugOverlaysSection.tsx` contains **no per-toggle prop and no per-toggle
      `<label>`** — one map over the rows — and its container has one
      `useAppSelector` and one `useCallback`.
- [x] **No `devOnly` field exists** (`grep -rn devOnly src/` → empty, as today),
      **no `DEBUG_LAYERS` registry, row type or walker was built**, and
      `CONTENT_LAYERS`, `frameProgram`, `executeFrame` and `GPU_HANDLE_ROWS` are
      **byte-identical** to `0b4ce84c0`. A reviewer expecting "debug derivation"
      to have touched the frame program must find that explained in #16.
- [x] `drawPickDebugOverlay.ts` differs from `0b4ce84c0` **only** in the settings
      path and the prose naming it — same encoder, same `loadOp`, same call site
      (D5).
- [x] The three slider row types are aliases over one `SliderField<K>`, `surface`
      lives on the flow alias alone, and **no `src/data/` or `src/components/`
      file changed in Task 4's commit** to make that compile (D9's claim; Task
      5's component edits are D10's, and land separately).
- [x] **One `DebugTuningSection`, three instantiations** (D10): neither
      `MilkyWayTuningSection.tsx` nor `ZoneOfAvoidanceTuningSection.tsx` nor
      `FlowTuningSection.tsx` still contains a `DebugSection` element or a
      `DebugSlider` `.map()` — each is one instantiation plus its own extras as
      children — and the three sections' rendered DOM is **identical** to
      `0b4ce84c0` (the Task 5 baseline diff is empty). `SettingsPanel/FlowRow.tsx`
      and the three containers are unchanged.
- [x] **The fieldStarSphere suspect is closed, not fixed** (D6):
      `fieldStarSphereLayer.ts` differs from `0b4ce84c0` by **comment lines
      only** — no gate, no new import — and `decisions.md:141` +
      `renderer-layer-outliers.md:165` both read RESOLVED NEGATIVE with the
      measured evidence (~1.81 AU position gate vs the 0.23 Mpc cut, `enabled()`
      false at cosmic zoom), pointing at
      `docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md` for the
      residual. **That backlog file is unmodified.**
- [x] The D5 backlog file carries the **design target** (pick execution as a
      parallel frame-program instance — a new ladder rung at the umbrella
      reassessment), **and** the audit as evidence: SAFE-WITH-CONDITIONS, the
      `zoneOfAvoidanceRenderer.ts:70` shared-uniform blocker with its ~10-line
      own-buffer fix named as a standalone-valid prep refactor, the placement
      condition, the Dawn runtime check, and the gizmo-stacking acceptance. A
      reader picking that rung up needs nothing from this plan file.
- [x] `PASS_GROUP_TITLES`, `timedSlotsGroupKeys.test.ts` and
      `frameProgram.test.ts` are **unchanged**: D2's ruling rests on the pins
      that already exist (`frameProgram.test.ts:404-455`, real program × real
      registry), and the only drift they miss — a dead key whose empty bucket
      `groupRows` silently drops (`frameProgram.ts:325-328`) — is inert data, so
      no parity test was added.
- [x] `npm run build` is green — the one gate `/feature-done` does not run.
- [x] `decisions.md` ships in this PR with decision #16 (the census, the
      data-vs-JSX line, the `devOnly` rejection, the same-fact rulings on all
      three booleans, the pick-overlay deferral with its real reason, its
      user-set design target and the audit that priced it, the `FOREGROUND_MAX`
      finding **and the fieldStarSphere verification**, D10's generic tuning
      section, the §2/§4 resolution) **and five in-place amendments**: #9's
      rung-6 clause, #7's `devOnly` clause (`:59-60`), #7's step-gate clause
      (`:55-56`), P1's "derived debug incl. PASS_GROUP_TITLES" deliverable
      (`:581-582`), and #11's fieldStarSphere bug-suspect (`:141`) — each
      pointing at #16. Rung 7's author reads the north star from decisions.md
      alone, without this plan file — and a reader of #7, #11 or P1 alone is not
      left expecting what this rung rejected.
- [x] The doc sweep is done: `current-contracts-map.md` no longer claims slider
      tables are hand-listed, no longer ranks the debug UI 🟠 without the
      reason, and §7's W6 row records "no walker";
      `renderer-layer-outliers.md:204` no longer says the `FOREGROUND_MAX` hoist
      "rides rung 2" and no longer miscounts the gate; `:165`'s 🔴 is closed.
- [x] Named observable behaviours confirmed by the user: three checkboxes, same
      labels, all off on load; pick-buffer overlay paints and clears; the disk
      ring appears only with a galaxy selected and is off again after reload;
      the impostor tint toggles; Renderer-Toggle group titles and order
      unchanged; GPU-timing groups still end with **Composites & pick**; and all
      three tuning sections look and behave exactly as before, the explorer
      panel's flow Intensity slider included.
- [x] Deferral boundary — a reviewer should NOT expect to find, in this PR: a
      `ContentLayer.devOnly` field (D3); `pickDebugOverlay` inside
      `CONTENT_LAYERS`, or the `zoneOfAvoidanceRenderer` pick-uniform split its
      fold would need (D5); any `FOREGROUND_MAX_DISTANCE_MPC` move, and no gate
      added to `fieldStarSphereLayer` (D6); a derived `PASS_GROUP_TITLES`, a
      schema-driven DebugPanel, or any generated JSX (D2 — D10's shared component
      is hand-written and hand-instantiated); changes to
      `maybeLazyLoadDebugVolume`, `renderStrategy` or `disabledPasses`' semantics
      (D8); any change to the debug layers' `enabled()` gates (D4); any change to
      `SettingsPanel/FlowRow.tsx` (D10); a bundle `debug` field (#9's umbrella
      deferral); any file move or rename (finding 7); rungs 7+.
