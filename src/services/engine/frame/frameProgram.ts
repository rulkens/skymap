/**
 * frameProgram — the FRAME as data, and the timing slots derived from it.
 *
 * A frame is an ordered sequence of steps: the compute prelude (the flow
 * integrate + the atmosphere sky-view LUT bake), a volume render, a
 * zone-of-avoidance band render (its own reduced-res offscreen, same family
 * as the volume render), an HDR render, two reduced-resolution aggregate
 * renders into their own offscreens
 * (survey stars, then the Milky-Way cloud), a near-field star-point render into
 * that same HDR accumulation (which also composites both aggregate offscreens
 * back in), a near-field foreground-body
 * render, that body composite OVER the HDR accumulator in linear space, the
 * single tone-mapping composite, then the swap-chain overlay renders (the
 * cosmological overlays, then the near-field captions). Pre-unification that
 * sequence lived as an imperative call chain spread across `renderFrame` and
 * two hand-wired HDR encoders — the order was implicit in which function
 * called which, and untestable without a GPU device. `frameProgram` returns
 * that same sequence as a plain `FrameStep[]`: the order is now inspectable
 * data one array deep, and the executor is the single imperative site that
 * walks it. See the renderer unification design
 * (`docs/superpowers/specs/2026-06-29-renderer-unification-design.md`) for the
 * essential/accidental split this data model rests on.
 *
 * The near-field foreground bodies (the zoom-to-earth fold) accumulate into
 * HDR before tone-mapping: a `foreground:0` render draws the true-scale bodies
 * (Sun, Earth) through the NEAR0 slab into the depth-bearing foreground target,
 * then a `foreground:0→hdr` composite lays them OVER the HDR accumulator in
 * LINEAR space (`tone: null`). Because their pixels join HDR before the single
 * tone-map, the bodies ride the SAME tone curve as the stars and galaxies —
 * there is one tone curve across the whole frame, and no seam where the Sun's
 * limb meets the cosmological scene. The lone `hdr→swap` replace-composite that
 * follows is the frame's ONLY tone-map.
 *
 * The swap-chain overlays draw AFTER that single tone-map, on top of the
 * tonemapped scene: the cosmological overlays (labels, marker-lines,
 * selection-ring) first, then the near-field captions. The opaque Sun/Earth
 * still occlude the cosmological labels behind them, but that occlusion is now
 * carried by the Prep A COVERAGE test (the COSMO overlays test against the
 * `foreground:0` depth) rather than by draw order — the foreground bodies no
 * longer composite after the cosmological swap render, so `frameProgram` no
 * longer depends on step order for that. The near-field captions still render
 * last so they land on top of the bodies.
 *
 * There is no `volume→hdr` composite — the volume offscreen is merged into
 * HDR by the `volume-upsample` *layer* inside the HDR render step, not a
 * separate whole-texture composite (plan-time decision 3). The `zoa`
 * offscreen (the zone-of-avoidance band raymarch) is merged the same way, by
 * `zoneOfAvoidanceUpsampleLayer` inside the same hdr COSMO step — so there is
 * no `zoa→hdr` composite step either; that layer also draws the band's
 * full-res curved lettering straight into HDR, since MSDF text can't ride a
 * reduced-res offscreen without blurring. The `star-aggregates` offscreen is
 * merged the same way — by the `star-upsample` layer inside the hdr NEAR0
 * render step, adjacent to the `star-catalog` leaf draw — so there is no
 * `star-aggregates→hdr` composite step either. The `mw-aggregate` offscreen
 * is the fourth of that family: merged by the `milky-way-upsample` layer
 * inside the same hdr NEAR0 step, so there is no `mw-aggregate→hdr` composite
 * step. Every offscreen-into-HDR merge in this program is a layer, never a
 * `'composite'` step; the two `'composite'` steps that DO exist
 * (`foreground:0→hdr`, `hdr→swap`) merge whole textures that no layer could,
 * because they carry depth or the tone curve.
 */

import type { FrameStep } from '../../../@types/engine/frame/FrameStep';
import type { ContentLayer } from '../../../@types/engine/frame/ContentLayer';
import type { ToneMap } from '../../../@types/rendering/ToneMap';
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import {
  COSMO,
  NEAR0,
  groupKeyOf,
  isBodySlabIndex,
  layerTimingSlotName,
  renderStepTimingSlotName,
  slabName,
} from './slabs';
import { CONTENT_LAYERS } from './passes';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';
import { SCENE_ANCHOR_POINT_BODIES } from '../../../data/bodies/sceneAnchorPointBodies';

/**
 * Upper bound on body rows `deriveSlabs` can emit in one frame: Earth (the
 * NEAR0-adjacent body baked into `earthLayer`, not a `SCENE_PLANETS` row)
 * plus every `SCENE_PLANETS` entry plus every `SCENE_ANCHOR_POINT_BODIES`
 * entry. `TIMED_SLOTS` allocates one slot per capacity row (not per row
 * actually drawn this frame) so the query-set size is a compile-time
 * constant — see `createGpuTimingService`.
 */
export const BODY_SLAB_CAPACITY = 1 + SCENE_PLANETS.length + SCENE_ANCHOR_POINT_BODIES.length;

/**
 * Build this frame's step program. `tone` is threaded into the LONE tone-map —
 * the `hdr→swap` replace-composite — which is the only place the HDR scene is
 * compressed to display range. The foreground-body composite runs in linear
 * space (`tone: null`) and rides that same single curve because it merges into
 * HDR before the tone-map, not after. The cosmological body (compute → volume
 * → hdr → tone-map → swap) projects through the COSMO slab; the near-field star
 * points and the near-field bodies + captions project through the NEAR0 slab.
 *
 * `bloomEnabled` (the `settings.bloom.enabled` master toggle) is the ONLY bloom
 * value that shapes the program: it decides whether the bloom step is emitted
 * between the linear body composite and the tone-map. The look knobs
 * (`strength`/`threshold`) are NOT threaded here — `runBloom` reads them live
 * from `state.settings.bloom` each draw, exactly as `earth`/`starCatalogs` knobs
 * do, because the step carries no uniform payload (unlike the `tone` a
 * `'composite'` step carries). So only `enabled` can change the step LIST;
 * strength/threshold change pixels without changing the frame's shape.
 *
 * `foregroundChain` (`foregroundChainOrder(ctx.slabs)`, painter-ordered
 * back-to-front) expands the ONE `foreground:0` render into one step per
 * entry, each `depthLoad: 'clear'` so a nearer body row doesn't test against
 * a farther row's depth — see the push loop below.
 *
 * `skyCubemapFacesToCapture` (`skyCubemapCaptureSchedule`'s output, computed
 * by `renderFrame` each frame from the lensing band alpha — Task 12) is the
 * black-hole lens's amortized sky-capture list: empty outside the band, so
 * NO capture steps are emitted at all (Q6's zero-dispatch guarantee — this is
 * the capture side of that contract, not just the lensing draw itself).
 * Placed in the compute prelude's wake, ahead of every other render step, so
 * a same-frame lensing draw (Task 13) can sample a cubemap this frame
 * actually wrote. One step per requested face, at the NEAR0 slab — the
 * fixed opt-in roster (`ContentLayer.skyCapture`, Ruling 6) is selected by
 * that flag rather than by `target` (see `executeFrame`'s capture-step
 * branch), so a flagged NEAR0-slab layer is reachable here; a COSMO-slab
 * candidate (`point-sprites`) would need its OWN COSMO-slab capture step,
 * which this program does not emit — moot today, since Task 13's
 * verification found every current roster candidate's GPU renderer assumes
 * at most one `draw()` call per submitted frame (the `queue.writeBuffer`/
 * `submit` landmine, docs/RENDERER.md), an invariant a multi-face capture
 * sweep breaks; no layer carries `skyCapture` yet, so these steps still
 * select an empty group and draw nothing pending that renderer-side fix.
 *
 * `sgrAStarLensingBodySlabs` (Task 14, Ruling 8) is the black-hole lens's OWN
 * missing step: no step here ever matched `sgrAStarLensingLayer` (`slab:
 * 'body'`, `target: 'hdr'`) before this task — it registered and compiled but
 * never drew (Task 13's own recorded finding). `renderFrame` resolves Sgr
 * A*'s body-m row each frame and passes it here ONLY inside the fade band, so
 * an inactive band emits no step at all (same zero-dispatch guarantee as
 * `skyCubemapFacesToCapture`). One `(hdr, slab)` render step per entry,
 * placed after the `(hdr, NEAR0)` roster step so the lens's OVER blend
 * occludes the roster light already accumulated there. It also ends up
 * drawing over `orbit-trails`/`body-glints` (the SAME shared step, per
 * `passes/index.ts`'s registry order) — fully keeping those two unwarped
 * needs splitting that shared step, which this one new step does not do; see
 * the task 14 report.
 */
export function frameProgram(
  tone: ToneMap,
  bloomEnabled: boolean,
  foregroundChain: readonly number[],
  skyCubemapFacesToCapture: readonly CubeFace[],
  sgrAStarLensingBodySlabs: readonly number[] = [],
): readonly FrameStep[] {
  const steps: FrameStep[] = [];

  steps.push({ kind: 'compute', name: 'flow' });
  // Atmosphere sky-view LUT bake — folds in this frame's camera altitude + sun
  // direction, so it re-bakes every frame (unlike the once-baked transmittance
  // + multi-scatter LUTs). In the compute prelude with `flow`, well ahead of the
  // `foreground:0` render step, so the atmosphere shell samples this frame's
  // table (WebGPU orders the compute write before the later fragment read).
  // Like `flow`, a `'compute'` step contributes no timing slot, so TIMED_SLOTS
  // is unaffected.
  steps.push({ kind: 'compute', name: 'atmosphereSkyView' });

  for (const face of skyCubemapFacesToCapture) {
    steps.push({ kind: 'render', target: 'sky-cubemap', slab: NEAR0, face });
  }

  steps.push({ kind: 'render', target: 'volume', slab: COSMO });
  // Zone-of-avoidance band raymarch into its own reduced-res offscreen —
  // the twin of the volume render immediately above. Precedes the hdr
  // COSMO step so `zoneOfAvoidanceUpsampleLayer` inside it can composite
  // this offscreen back in; merged by a LAYER, never a `'composite'` step,
  // so there is no `zoa→hdr` step either (same reasoning as `volume`).
  steps.push({ kind: 'render', target: 'zoa', slab: COSMO });
  steps.push({ kind: 'render', target: 'hdr', slab: COSMO });
  // Survey-star AGGREGATE stream into its own half-res offscreen, projected
  // through NEAR0 (the same parsec-scale anchors as the star catalog). Drawn
  // BEFORE the hdr NEAR0 step so the `star-upsample` layer inside that step
  // can composite this offscreen — the twin of the volume render preceding
  // its `volume-upsample` layer. The aggregate glow field is the fill-bound
  // half of the star pass; half-res quarters its fragment cost.
  steps.push({ kind: 'render', target: 'star-aggregates', slab: NEAR0 });
  // The Milky-Way twin of the star-aggregate offscreen: the procedural
  // cloud's additive star billboards into their own reduced-resolution
  // `mw-aggregate` target, projected through the same NEAR0 slab as the dust
  // pass that follows them in HDR. Same reason as its sibling — a summed
  // additive glow field is low-frequency, so rendering it at 1/scale drops
  // fragment cost by the square of the divisor and costs only bilinear
  // interpolation of something already smooth. Like `star-aggregates` it is
  // merged into HDR by a *layer* (`milky-way-upsample`, inside the hdr NEAR0
  // step below), not by a whole-texture `'composite'` step, so no
  // `mw-aggregate→hdr` step exists. It must precede that hdr NEAR0 step: the
  // consumer lives there, and it in turn must precede `milky-way`'s
  // multiplicative dust draw so the dust extincts the cloud's own starlight.
  steps.push({ kind: 'render', target: 'mw-aggregate', slab: NEAR0 });
  // Near-field star points into the SAME hdr accumulation, but projected
  // through NEAR0: COSMO's near plane (0.01 Mpc — slabs.ts) would clip the
  // parsec-scale star anchors, so the points ride their own slab while
  // still accumulating into HDR BEFORE the tone-map composite below — one
  // tone curve for stars and galaxies. The hdr target is already touched
  // by the COSMO step above, so this pass loads rather than clears.
  steps.push({ kind: 'render', target: 'hdr', slab: NEAR0 });

  // The black-hole lens's own (hdr, BODY[k]) step(s) — see this function's
  // doc for why it exists and its residual limitation. Runs after the (hdr,
  // NEAR0) roster above; empty (inactive band) contributes no step.
  for (const slab of sgrAStarLensingBodySlabs) {
    steps.push({ kind: 'render', target: 'hdr', slab });
  }

  // Near-field foreground bodies (zoom-to-earth fold). Rendered into their
  // depth-bearing foreground target, then composited OVER hdr in LINEAR
  // space (tone: null) so the Sun/Earth pixels join the HDR accumulator
  // BEFORE tone-mapping and ride the SAME single tone curve as the stars and
  // galaxies. No second tone-map: the lone hdr→swap replace-composite below
  // is the frame's only tone-map, so there is one tone curve across the
  // whole frame — no seam where the Sun's limb meets the cosmological scene.
  //
  // Assembled as a RUN in painter order (far → near) rather than one literal
  // entry: `foregroundChain` expands it into one depth-bearing step per row
  // (NEAR0 — the Sun's slab — plus each body row), sharing this one target.
  // Each row's `depthLoad: 'clear'` restarts depth so a nearer row's opaque
  // pixels aren't test-rejected against a farther row's depth — painter order
  // is the occlusion mechanism, not the depth test. An empty chain (no star
  // sphere resolved, no bodies visible) emits no render step here at all, but
  // the composite below still runs — see its own no-op-on-untouched guard in
  // `executeFrame`.
  for (const slab of foregroundChain) {
    steps.push({ kind: 'render', target: 'foreground:0', slab, depthLoad: 'clear' });
  }

  steps.push({
    kind: 'composite',
    step: { source: 'foreground:0', dest: 'hdr', blend: 'over', tone: null },
  });
  // Screen-space bloom, gated on the master toggle. ONE step, not N render
  // steps: `runBloom` opens the pyramid's ten passes (bright prefilter
  // hdr → bloom0, a DESCENDING downsample chain bloom0 → bloom4, an ASCENDING
  // additive upsample fold bloom4 → bloom0, and the strength-scaled fold back
  // into HDR) in strict order. A ping-pong mip pyramid writes the same target
  // twice with different ops (a downsample that clears, then an additive
  // upsample that loads), which the executor's `(target, slab)` render-step
  // model cannot express: it re-fires every layer matching a step's group, so
  // a reused-target upsample would fire at its downsample step and read a
  // stale, last-frame level. The single sequential step sidesteps that — see
  // runBloom for the strict-order rationale. Placed after the foreground:0→hdr
  // composite (the bright prefilter samples the composited HDR scene) and
  // before the lone hdr→swap tone-map (the fold rides that one curve).
  if (bloomEnabled) steps.push({ kind: 'bloom' });
  steps.push({ kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone } });

  // Cosmological + near-field swap overlays now draw AFTER the tone-map, on
  // top of the tonemapped scene. The COSMO overlays (labels, marker-lines,
  // selection-ring) occlude against the foreground bodies via the Prep A
  // coverage test — frameProgram no longer relies on draw order to keep the
  // opaque Sun/Earth in front of the cosmological labels. The NEAR0 swap
  // render (Sun/Earth captions) follows so captions land on top of the bodies.
  steps.push({ kind: 'render', target: 'swap', slab: COSMO });
  steps.push({ kind: 'render', target: 'swap', slab: NEAR0 });

  return steps;
}

/**
 * Derive the ordered GPU-timing slot names from a program + the content-layer
 * registry (plan-time decision 5). Each step contributes:
 *
 *   - `'render'`   → the names of its matching layers (same `target` and
 *     `slab`), in registry order — one timing slot billed per layer.
 *   - `'composite'`→ a single `'<source>→<dest>'` slot (the unicode arrow),
 *     e.g. the tone-map's `'hdr→swap'`.
 *   - `'bloom'`    → a single `'bloom'` slot spanning the whole sub-pipeline.
 *   - `'compute'`  → nothing; compute dispatches aren't timed as content slots.
 *
 * `'pick'` (the parallel r32uint pick pass) is appended last, matching the
 * frame's execution order. Deriving the slot order this way rather than
 * hand-maintaining a list means it's a pure function of the same program the
 * executor walks, so it can't drift from what actually runs.
 */
export function timedSlotsOf(
  program: readonly FrameStep[],
  layers: readonly ContentLayer[],
): readonly string[] {
  return timedSlotRowsOf(program, layers).map((row) => row.name);
}

/**
 * One derived timing slot: its `name` (what the timing service allocates a
 * query pair for and the DebugPanel rows on) plus the `groupKey` of the step
 * that produced it — `'<target>·<SLAB>'` for a render slot (e.g. `'hdr·COSMO'`,
 * `'foreground:0·NEAR0'`), the literal `'composite'` for a whole-texture
 * merge, and `'pick'` for the parallel pick program. The groupKey is what the
 * two DebugPanel lists bucket on, so a new layer lands in the right visual
 * group automatically via its `(target, slab)`.
 */
export type TimedSlotRow = { readonly name: string; readonly groupKey: string };

/**
 * A run of timed slots the two DebugPanel lists render under one header: a
 * human `title` (from `PASS_GROUP_TITLES`, or the raw groupKey as fallback)
 * and the slots that map to it, in draw order.
 */
export type TimedSlotGroup = { readonly title: string; readonly rows: readonly TimedSlotRow[] };

/**
 * groupKey → human group title, in the order the DebugPanel renders the
 * groups. Several producing steps deliberately share one title — the
 * cosmological scalar-volume raymarch and the two reduced-resolution aggregate
 * offscreens (survey stars, Milky-Way cloud) are all "volumes & aggregates";
 * the two whole-texture composites and the pick
 * pass are all infra "composites & pick"; the COSMO and NEAR0 swap overlays
 * are both "overlays" — so grouping-by-title merges those (non-adjacent in
 * execution order) into one scannable seam. A groupKey with no entry here
 * degrades to its raw key as the title (self-maintaining: a genuinely new
 * target/slab step still gets its own group rather than vanishing). The value
 * order fixes the group display order — see `groupRows`.
 */
export const PASS_GROUP_TITLES: Readonly<Record<string, string>> = {
  'volume·COSMO': 'Volumes & aggregates',
  'zoa·COSMO': 'Volumes & aggregates',
  'star-aggregates·NEAR0': 'Volumes & aggregates',
  'mw-aggregate·NEAR0': 'Volumes & aggregates',
  // The black-hole lens's amortized sky-capture steps (Task 12) — 0-6 of
  // them per frame depending on `skyCubemapCaptureSchedule`, so its own
  // group rather than folding into an existing title.
  'sky-cubemap·NEAR0': 'Sky capture',
  'hdr·COSMO': 'Cosmos · HDR',
  'hdr·NEAR0': 'Near field · HDR',
  // One `hdr·BODY[k]` row per capacity slot — today only the black-hole lens
  // (`sgrAStarLensingLayer`) targets `hdr` on a body-m slab, so every slot
  // buckets under one title regardless of which row Sgr A* lands in this
  // frame, same reasoning as the `foreground:0·BODY[k]` block below.
  ...Object.fromEntries(
    Array.from({ length: BODY_SLAB_CAPACITY }, (_, k) => [`hdr·${slabName(k + 2)}`, 'Sgr A* lensing']),
  ),
  'foreground:0·NEAR0': 'Foreground bodies · depth',
  // One `foreground:0·BODY[k]` row per capacity slot, derived from `slabName`
  // rather than authored — a new SCENE_PLANETS row widens BODY_SLAB_CAPACITY
  // and this table follows with no hand-added line.
  ...Object.fromEntries(
    Array.from({ length: BODY_SLAB_CAPACITY }, (_, k) => [
      `foreground:0·${slabName(k + 2)}`,
      'Foreground bodies · depth',
    ]),
  ),
  // The bloom sub-pipeline bills one `'bloom'` slot (the whole bright →
  // downsample → upsample → fold span), placed after Foreground and before
  // Overlays so the group renders in that slot.
  bloom: 'Bloom',
  'swap·COSMO': 'Overlays',
  'swap·NEAR0': 'Overlays',
  composite: 'Composites & pick',
  pick: 'Composites & pick',
};

/**
 * The single walk every projection shares: the ordered slot list
 * (`timedSlotsOf`), the grouped lists (`timedSlotGroupsOf` / `groupPassNames`),
 * and the name→groupKey map (`PASS_GROUP_KEYS`) are each a projection of this
 * one derivation, so a slot's group can't drift from its position in the row
 * order — a new layer joins them all at once.
 */
function timedSlotRowsOf(
  program: readonly FrameStep[],
  layers: readonly ContentLayer[],
): readonly TimedSlotRow[] {
  const rows: TimedSlotRow[] = [];
  for (const step of program) {
    if (step.kind === 'render') {
      // Every layer matched by this step shares the step's `(target, slab)`, so
      // one groupKey covers the whole run. The key comes from the shared
      // `groupKeyOf` helper (slabs.ts) — the same definition the merged executor
      // resolves against, so the two can't drift. Every render step now has a
      // distinct `(target, slab)` (the pyramid's reused-target repeats moved into
      // the single `'bloom'` step), so no dedup is needed here.
      const groupKey = groupKeyOf(step.target, step.slab);
      for (const layer of layers) {
        // A 'body' layer has no fixed slab index — it matches every body-row
        // step, the same widening `executeFrame` applies via
        // `view.slab.frame.kind === 'body-m'`. This derivation has no `ctx` to
        // resolve a frame kind from, so it reads the index layout directly
        // through `isBodySlabIndex` — the one other legitimate reading of the
        // same fact (slabs.ts).
        const matchesStep =
          layer.slab === step.slab || (layer.slab === 'body' && isBodySlabIndex(step.slab));
        if (layer.target === step.target && matchesStep) {
          // `layerTimingSlotName` carries the row into the slot NAME for a body
          // step, so two body rows sharing one layer (Jupiter + a moon, both
          // drawn by `planetsLayer`) each get their own query-set slot instead
          // of colliding on the same two indices (see its doc, slabs.ts).
          rows.push({ name: layerTimingSlotName(layer.name, step.slab), groupKey });
        }
      }
      // One extra slot per render STEP whose NAME is the groupKey itself, so
      // the `merged` executor — which draws the whole group in one pass — has a
      // slot to attach `timestampWrites` to (a merged pass can't bill the
      // per-layer slots; those exist only for the `perLayerTimed` shape). Pushed
      // AFTER the layer loop so the group total trails its layers in draw order.
      // Emitted unconditionally for shape-stability; simply unused when the
      // group is empty (the executor's `if (group.length === 0) break;` opens no
      // pass, so no timing is billed against it). `groupKey` is unique per step
      // for every ordinary render step (each has a distinct `(target, slab)`)
      // and never collides with a layer name — EXCEPT the sky-cubemap capture
      // steps, which share `('sky-cubemap', NEAR0)` across all 6 faces;
      // `renderStepTimingSlotName` appends the face there so each still earns
      // its own slot (see its doc, slabs.ts). The DebugPanel bucket still uses
      // the shared `groupKey`, so all 6 land under one "Sky capture" group.
      rows.push({ name: renderStepTimingSlotName(groupKey, step.face), groupKey });
    } else if (step.kind === 'composite') {
      // A composite merges whole textures rather than projecting geometry — it
      // belongs to no slab, and all composites share the one infra group.
      rows.push({ name: `${step.step.source}→${step.step.dest}`, groupKey: 'composite' });
    } else if (step.kind === 'bloom') {
      // The bloom sub-pipeline bills one slot spanning its whole pass sequence
      // (see runBloom) — the same name the fold + bright passes write the shared
      // query pair under.
      rows.push({ name: 'bloom', groupKey: 'bloom' });
    }
    // 'compute' steps contribute no timing slot.
  }
  // Pick is a parallel program over the whole registry (both slabs).
  rows.push({ name: 'pick', groupKey: 'pick' });
  return rows;
}

/**
 * Bucket an ordered row list into display groups by title. The group order is
 * the unique titles of `PASS_GROUP_TITLES` in declared order (which fixes the
 * six-group layout), then any fallback titles (raw groupKeys with no mapping)
 * in first-appearance order. Rows keep their draw order within a group, and an
 * empty group is dropped — that's how the toggles list omits the "composites &
 * pick" group whose rows aren't togglable.
 *
 * `namesSeen` still guards against a genuine same-title duplicate (two
 * distinct groupKeys sharing a display title, e.g. every `foreground:0·BODY[k]`
 * bucketing under "Foreground bodies · depth") landing the same row NAME
 * twice — no such collision exists today (`layerTimingSlotName` keys a
 * `slab: 'body'` layer's per-row name by its own `BODY[k]`), but the guard
 * stays as the cheap belt for that shape rather than assuming it can't recur.
 */
function groupRows(rows: readonly TimedSlotRow[]): readonly TimedSlotGroup[] {
  const titleOf = (groupKey: string): string => PASS_GROUP_TITLES[groupKey] ?? groupKey;

  const order: string[] = [];
  const seen = new Set<string>();
  const remember = (title: string): void => {
    if (!seen.has(title)) {
      seen.add(title);
      order.push(title);
    }
  };
  for (const title of Object.values(PASS_GROUP_TITLES)) remember(title);
  for (const row of rows) remember(titleOf(row.groupKey));

  const byTitle = new Map<string, TimedSlotRow[]>();
  const namesSeenByTitle = new Map<string, Set<string>>();
  for (const row of rows) {
    const title = titleOf(row.groupKey);
    let namesSeen = namesSeenByTitle.get(title);
    if (namesSeen === undefined) {
      namesSeen = new Set<string>();
      namesSeenByTitle.set(title, namesSeen);
    }
    if (namesSeen.has(row.name)) continue;
    namesSeen.add(row.name);
    const bucket = byTitle.get(title);
    if (bucket) bucket.push(row);
    else byTitle.set(title, [row]);
  }

  const groups: TimedSlotGroup[] = [];
  for (const title of order) {
    const bucket = byTitle.get(title);
    if (bucket && bucket.length > 0) groups.push({ title, rows: bucket });
  }
  return groups;
}

/**
 * The ordered GPU-timing slots grouped for display — the shape both DebugPanel
 * lists consume. A projection of the same program + registry walk that orders
 * `timedSlotsOf`, so the grouping can't drift from the executed frame.
 */
export function timedSlotGroupsOf(
  program: readonly FrameStep[],
  layers: readonly ContentLayer[],
): readonly TimedSlotGroup[] {
  return groupRows(timedSlotRowsOf(program, layers));
}

/**
 * The engine's ordered GPU-timing slots — the single source of truth for both
 * query-set slot allocation (`createGpuTimingService`) and DebugPanel display
 * order (`GpuTimingsSection`). Derived from the real FRAME program + the
 * content-layer registry rather than hand-maintained, so the two consumers
 * can never see a different slot list than what the frame actually runs.
 *
 * The tone values are placeholders: `timedSlotsOf` only reads step kinds and
 * `(target, slab)` — the composite's `tone` never affects a slot NAME — so a
 * fixed `PLACEHOLDER_TONE` yields the same list every real frame's
 * `frameProgram(tone)` would.
 *
 * `bloomEnabled = true` so the query-set allocation always includes the `'bloom'`
 * slot. It costs nothing on frames where bloom is off — the master toggle omits
 * the `'bloom'` step, and `runBloom` also no-ops on a null `bloomPyramid`, so the
 * pre-allocated slot simply goes unused, like any empty group's slot.
 */
const PLACEHOLDER_TONE: ToneMap = { exposure: 1, curve: 0, hdrKnee: 0, hdrHeadroom: 0 };

/**
 * The MAXIMUM foreground chain — NEAR0 plus every capacity body row — so the
 * slot pool below is sized off the registry (`BODY_SLAB_CAPACITY`), never a
 * hand-picked chain length. A real frame's chain is almost always shorter
 * (most bodies are culled); the unused slots simply read zero, same as any
 * other empty group (see `GpuTimingsSection`).
 */
const MAX_FOREGROUND_CHAIN: readonly number[] = [
  NEAR0,
  ...Array.from({ length: BODY_SLAB_CAPACITY }, (_, k) => k + 2),
];

/**
 * All 6 `CubeFace` values — the same "maximum, not a real frame's shorter
 * list" sizing rationale `MAX_FOREGROUND_CHAIN` documents above, so the
 * DebugPanel's GPU-timing groups include the sky-cubemap capture rows even
 * on a frame where the lensing band is inactive and the real capture list
 * would be empty.
 */
const ALL_CUBE_FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

/**
 * The MAXIMUM sgrAStarLensing body-slab list — every capacity index (Task
 * 14), the same "maximum, not a real frame" sizing `MAX_FOREGROUND_CHAIN`
 * documents above: Sgr A*'s painter-order row moves with whichever OTHER
 * bodies are visible, so the query-set pool must cover every capacity slot
 * it could land on, not just today's live value.
 */
const MAX_SGR_A_STAR_LENSING_BODY_SLABS: readonly number[] = Array.from(
  { length: BODY_SLAB_CAPACITY },
  (_, k) => k + 2,
);

export const TIMED_SLOTS: readonly string[] = timedSlotsOf(
  frameProgram(
    PLACEHOLDER_TONE,
    true,
    MAX_FOREGROUND_CHAIN,
    ALL_CUBE_FACES,
    MAX_SGR_A_STAR_LENSING_BODY_SLABS,
  ),
  CONTENT_LAYERS,
);

/**
 * The real timing slots grouped for the GpuTimingsSection. Same program +
 * registry walk that orders `TIMED_SLOTS`, so a renderer that joins
 * `CONTENT_LAYERS` gets a grouped row here with zero DebugPanel edits.
 */
export const TIMED_SLOT_GROUPS: readonly TimedSlotGroup[] = timedSlotGroupsOf(
  frameProgram(
    PLACEHOLDER_TONE,
    true,
    MAX_FOREGROUND_CHAIN,
    ALL_CUBE_FACES,
    MAX_SGR_A_STAR_LENSING_BODY_SLABS,
  ),
  CONTENT_LAYERS,
);

/**
 * Plain `layer.name` → groupKey — a SEPARATE walk from `timedSlotRowsOf`,
 * because the engine handle's `allNames` (what `groupPassNames` below
 * actually receives) is `CONTENT_LAYERS.map(l => l.name)`: one entry per
 * REGISTERED layer, never per-body-row (toggling a layer disables it on
 * every row it draws — see `RenderTogglesSection`'s one-way override doc).
 * A `slab: 'body'` layer's plain name therefore matches every body-row step
 * here; later occurrences simply overwrite earlier ones in the built map,
 * which is harmless — `PASS_GROUP_TITLES` maps every `<target>·BODY[k]`
 * groupKey to the SAME title, so whichever row the last occurrence lands on
 * resolves to the identical display group.
 */
function plainLayerGroupKeys(
  program: readonly FrameStep[],
  layers: readonly ContentLayer[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const step of program) {
    if (step.kind !== 'render') continue;
    const groupKey = groupKeyOf(step.target, step.slab);
    for (const layer of layers) {
      const matchesStep =
        layer.slab === step.slab || (layer.slab === 'body' && isBodySlabIndex(step.slab));
      if (layer.target === step.target && matchesStep) map.set(layer.name, groupKey);
    }
  }
  return map;
}

/**
 * Layer name → groupKey, so a consumer holding only PLAIN names (the
 * RenderTogglesSection, fed the engine handle's live togglable-pass list) can
 * project them into the same groups the timing list uses.
 */
const PASS_GROUP_KEYS: ReadonlyMap<string, string> = plainLayerGroupKeys(
  frameProgram(
    PLACEHOLDER_TONE,
    true,
    MAX_FOREGROUND_CHAIN,
    ALL_CUBE_FACES,
    MAX_SGR_A_STAR_LENSING_BODY_SLABS,
  ),
  CONTENT_LAYERS,
);

/**
 * Group an arbitrary ordered name list (the DebugPanel toggles' live pass
 * names) into the same display groups as the timing list. A name with no known
 * groupKey (e.g. a stale/removed pass) falls back to a group titled with the
 * name itself rather than being dropped.
 */
export function groupPassNames(names: readonly string[]): readonly TimedSlotGroup[] {
  return groupRows(names.map((name) => ({ name, groupKey: PASS_GROUP_KEYS.get(name) ?? name })));
}
