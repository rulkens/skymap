# Declarative frame program — brainstorm notes, 2026-09-22/23

Status: brainstorm IN PROGRESS, no rulings on the strained cases yet, no code. Uncommitted on
`main`; move to the feature worktree when one exists. Started as "one machinery for upsample
passes" and widened when the user asked for a Layer to declare _when_ its passes run as data.

## 1. Where this came from — the upsample machinery

Four sites are the same animal (a reduced-res additive offscreen blitted back into `hdr`):
`volume`, `zoa`, `star-aggregates`, `mw-aggregate`. They already share `createUpsamplePass` +
`UpsamplePassRow` and `RenderTargetSpec.scale` + `reducedTargetSize`. Still hand-rolled per pair:
the blit handle's lifecycle, the producer's `viewportPx` / `pxPerRad` formula (3 copies, backlog
item), the liveness gate restated in producer and consumer, two `frameSections.ts` lines, a
`passGroupTitles` row. `starAggregateUpsample` is a copy of `additiveUpsample` with a knee
fragment. Out of scope: bloom pyramid, aerial-perspective froxels, mip chains, ISM dust blur,
the tool hosts.

Rulings taken there, all carried into the model below:

- Offscreen declaration is pure data: `{ target, scale, composite: 'lowPass' | 'starKnee' }`,
  plus where the upsample lands. No ordering vocabulary in the row (`slab`/`before`/`trailing`
  rejected as smuggled ordering).
- `scale` is owned by the Layer: a selector into its own slice, default in its `initialState`,
  slider in its own debug UI. A constant stays allowed.
- The two blit factories merge into one taking the fragment source; the derived
  `<producer>-upsample` pass gates on the producer's `enabled` (closes the DebugPanel
  producer-toggle freeze bug).
- The executor hands a pass drawing into a scaled target a view sized to that target
  (`viewportPx`, scaled `pxPerRad`) — kills the three formula copies.
- Capture faces render the pair (offscreen + upsample) like every other view; the in-shader
  knee bypass in `drawStarStream` and the viewport special case in `starAggregatesPass` are
  deleted. Perf expected neutral-or-better (half-res fill, one composite per face); measure.
  Spec must pick face-sized reduced row vs uv-scaled sampling.
- Landmine: the "256² faces" comment on the sky-capture roster is stale — that is the
  `solar-system-sky` probe backdrop; the Sgr A* `sky-cubemap` is the `cubemapResolutionPx`
  knob (default 1024, 256–2048).

## 2. Why it widened

The user wants zero core edits per Layer: a Layer declares everything it does in a frame.
Inventory of `frameSections.ts` (358 lines): 39 stated load-bearing ordering constraints,
5 enforced by `checkFrameOrder`; 14 derivable from target read/write, 18 blend-mode or painter
layering (semantic, not dataflow), 5 depth-marker placement inside the body roster, 2 HUD
legibility only.

**ADR 0011 (2026-08-17) and layer-composition ruling Q14 (2026-09-10) rejected derived frame
order and declined to coin "phase".** Premise then: constraints are semantic, list is ~13 steps,
small and stable. Today: semantic still holds for half; small/stable has weakened. The model
below reopens the "phase" half of the ADR but NOT the toposort half — the semantic order stays
hand-authored in core, it just shrinks from pass positions to named points. Needs a superseding
ADR.

## 3. How other engines do it

All of them: a core-owned skeleton of named ordering points, extensions declare their point as
data, resource dependency graphs only within a point. Unity URP `RenderPassEvent` (ints spaced
50 apart, `+n` orders within) + Render Graph; Unreal hand-written `Render()` with fixed
delegates / post-process injection points + RDG for resources; Bevy labelled core nodes +
plugin-added edges; Godot 4 `CompositorEffect.effect_callback_type` enum; Frostbite FrameGraph.
A core edit happens only for a NEW point, one enum member.

## 4. The model so far

1. **Skeleton** `src/data/rendering/framePoints.ts`: today's `frameSections.ts` steps with the
   rosters removed, each named, keeping section scope, target, slab, depth, slot and the
   rationale comment. Roughly: prelude plan/compute/skyCaptures/probeCapture; scene plan/compute,
   `cosmo`, `beforeDust`, `dust`, `near0`, `lens`, `postLens`, `foreground`, `aerial`,
   `foregroundComposite`, `postComposite`; post bloom/tonemap; `overlaysCosmo`, `overlaysNear0`.
2. **`Layer.passes` is a record keyed by pass name**; `ContentPass.name` deleted; keys typed so
   references are `tsc`-checked. Order in the record is meaningless (frame program orders).
3. **Runtime injected at call time**: `ContentPass<Runtime>` methods take `runtime` as the last
   parameter; Layer passes become static constants like core's. Same question for
   `fades`/`guides`/`selection`/`computes`/`planners`/`assets` = separate follow-up.
4. **Placement on the pass**, a two-variant union:
   `{ at: FramePoint; order?: number }` or `{ offscreen: OffscreenSpec }` where
   `OffscreenSpec = { target, scale, composite, at, order? }` (`at` = where the derived upsample
   lands; the producer step is placed ahead of it). `Layer.targets` keeps only rows no pass
   draws through (sky cubemaps). `roles?: PassRole[]` (default `['scene']`) replaces the
   capture rosters' `cosmoPasses`/`near0Passes`/`bodyPasses` — the "captures as views" backlog
   item's shape.
5. **Computes and planners need no field**: their `scope` picks the section's plan/compute point.
6. **Walker**: per point collect passes by `at`, sort by `order`, insert offscreen producer
   steps ahead of their consumer's point, then expand exactly as `expandFrameOrder` does today
   (merge rule, capture fan-out, foreground chain unchanged). `checkFrameOrder` shrinks to: every
   `at` names a point, every offscreen `at` is an `hdr` point, every pass has a home. Frame-order
   tests move from asserting rosters to asserting a debug dump of the assembled program.
7. Derived upsample names (`scalar-volume-upsample`, `star-aggregates-upsample`) rename HUD
   rows and toggle keys.

## 5. Every pass checked — fits / strained

Fits with `at` alone (24): whole cosmo roster, `milky-way` at `dust`, near0 roster, lens,
`body-glints`, `aerial-perspective`, `orbit-trails`, both overlay rosters. Fits with `offscreen`
(4). Fits with `roles`: sky-capture roster (galaxy sprites, textured disks, star pair), probe
roster (each exclusion's reason moves onto the excluded pass). Unaffected: pick passes, bloom /
tonemap / composite step kinds.

**Strained — UNRULED, user asked for these one by one and went to bed after reading them:**

1. **Foreground chain, two owners.** `deriveSlabs` orders body slabs and the NEAR0 star-sphere
   slab far→near per frame; `foreground` expands one depth-clearing step per entry, choosing
   `near0Passes` (starCatalog) or `bodyPasses` (body) by slab kind. Two `at` points would need a
   walker exception ("interleaved, not sequential"). PROPOSED: keep `foreground` a step kind;
   each Layer declares `foreground: { row: 'near0' | 'body', passes: [...] }`; the walker
   concatenates per row.
2. **Body roster depth marker.** Ordered list with one `{ sampleDepth: [...] }` marker split
   into clear / sample / load steps by `bodyRowSteps`; four intra-roster constraints
   (`cloud-shell` after `earth`, `rings` after opaque spheres, samplers after writers,
   `mesh-bodies` last). Option A: body Layer owns the ordered list verbatim (RECOMMENDED — the
   only painter-ordered roster in the frame, honest about it). Option B: `at: 'foregroundBody'`
   + load-bearing `order` + `depth: 'write' | 'sample'` attribute, marker derived — one
   mechanism but `order` becomes semantic in one point and the "why 40, why 60" scatters.
3. **`sky-cubemap-blit`** draws only on probe faces. `at: 'cosmo'` + `roles: ['probeCapture']`
   works but `at` is a slab-picker, not a placement. Alternative `roles: [{ capture, slab }]`
   with `at` optional loses type totality. PROPOSED: accept the first form with a comment.

## 6. Open / next

- Rule on strained 1–3.
- Confirm the whole model → superseding ADR (via `/adr`) → `refactor-ground` → spec
  (`docs/superpowers/specs/2026-09-23-declarative-frame-program-design.md`) → plan.
- The upsample machinery then rides this: `offscreen` variant + merged blit factory + executor
  view sizing + capture-pair. Sequence question for the spec: ground prep (passes→record,
  runtime injection, executor sizing) as its own PR first.
- Success criterion RULED: zero core edits per Layer, ideally.
