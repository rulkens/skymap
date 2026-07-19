/**
 * frameProgram — the FRAME as data, and the timing slots derived from it.
 *
 * A frame is an ordered sequence of steps: the compute prelude (the flow
 * integrate + the atmosphere sky-view LUT bake), a volume render,
 * an HDR render, a half-res survey-star-aggregate render into its own
 * offscreen, a near-field star-point render into that same HDR accumulation
 * (which also composites the aggregate offscreen back in), a tone-mapping
 * composite, the cosmological swap-chain overlay render, then the near-field
 * tail — the foreground bodies, their composite onto the swap chain, and the
 * near-field captions. Pre-unification that
 * sequence lived as an imperative call chain spread across `renderFrame` and
 * two hand-wired HDR encoders — the order was implicit in which function
 * called which, and untestable without a GPU device. `frameProgram` returns
 * that same sequence as a plain `FrameStep[]`: the order is now inspectable
 * data one array deep, and the executor is the single imperative site that
 * walks it. See the renderer unification design
 * (`docs/superpowers/specs/2026-06-29-renderer-unification-design.md`) for the
 * essential/accidental split this data model rests on.
 *
 * The near-field tail (the zoom-to-earth fold) is now wired: a
 * `foreground:0` render draws the true-scale bodies (Sun, Earth) through the
 * NEAR0 slab into the depth-bearing foreground target, a `foreground:0→swap`
 * composite lays them over the tonemapped scene, then a NEAR0 swap render
 * draws the Sun/Earth captions. The tail's step order is the visible
 * "captions over bodies, bodies over cosmological labels" decision: the
 * near-field swap render (captions) follows the foreground composite so
 * captions land on top of the bodies, and that composite follows the
 * cosmological swap render so the opaque bodies occlude the cosmological
 * labels behind them — an ordering choice now readable in the program rather
 * than buried in an `encodeForegroundOver`-after-`encodeUiOverlay` convention.
 *
 * There is no `volume→hdr` composite — the volume offscreen is merged into
 * HDR by the `volume-upsample` *layer* inside the HDR render step, not a
 * separate whole-texture composite (plan-time decision 3). The
 * `star-aggregates` offscreen is merged the same way — by the `star-upsample`
 * layer inside the hdr NEAR0 render step, adjacent to the `star-catalog` leaf
 * draw — so there is no `star-aggregates→hdr` composite step either. The two composites
 * in the program share one `tone` object by reference: the tone-map `hdr→swap`
 * (where the HDR scene is compressed to display range before the overlay
 * layers draw on top) and the `foreground:0→swap` OVER, so the tone curve is
 * identical across the Sun's limb.
 */

import type { FrameStep } from '../../../@types/engine/frame/FrameStep';
import type { ContentLayer } from '../../../@types/engine/frame/ContentLayer';
import type { ToneMap } from '../../../@types/rendering/ToneMap';
import { COSMO, NEAR0, SLAB_NAME } from './slabs';
import { CONTENT_LAYERS } from './passes';

/**
 * Build this frame's step program. `tone` is threaded into BOTH composites —
 * the same object reference — so the tone-map curve is identical where the
 * foreground bodies meet the tonemapped cosmological scene. The cosmological
 * body (compute → volume → hdr → tone-map → swap) projects through the COSMO
 * slab; the near-field star points and the near-field tail (foreground
 * bodies, their composite, captions) project through the NEAR0 slab.
 */
export function frameProgram(tone: ToneMap): readonly FrameStep[] {
  return [
    { kind: 'compute', name: 'flow' },
    // Atmosphere sky-view LUT bake — folds in this frame's camera altitude + sun
    // direction, so it re-bakes every frame (unlike the once-baked transmittance
    // + multi-scatter LUTs). In the compute prelude with `flow`, well ahead of the
    // `foreground:0` render step, so the atmosphere shell samples this frame's
    // table (WebGPU orders the compute write before the later fragment read).
    // Like `flow`, a `'compute'` step contributes no timing slot, so TIMED_SLOTS
    // is unaffected.
    { kind: 'compute', name: 'atmosphereSkyView' },
    { kind: 'render', target: 'volume', slab: COSMO },
    { kind: 'render', target: 'hdr', slab: COSMO },
    // Survey-star AGGREGATE stream into its own half-res offscreen, projected
    // through NEAR0 (the same parsec-scale anchors as the star catalog). Drawn
    // BEFORE the hdr NEAR0 step so the `star-upsample` layer inside that step
    // can composite this offscreen — the twin of the volume render preceding
    // its `volume-upsample` layer. The aggregate glow field is the fill-bound
    // half of the star pass; half-res quarters its fragment cost.
    { kind: 'render', target: 'star-aggregates', slab: NEAR0 },
    // Near-field star points into the SAME hdr accumulation, but projected
    // through NEAR0: COSMO's near plane (0.01 Mpc — slabs.ts) would clip the
    // parsec-scale star anchors, so the points ride their own slab while
    // still accumulating into HDR BEFORE the tone-map composite below — one
    // tone curve for stars and galaxies. The hdr target is already touched
    // by the COSMO step above, so this pass loads rather than clears.
    { kind: 'render', target: 'hdr', slab: NEAR0 },
    { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone } },
    { kind: 'render', target: 'swap', slab: COSMO },
    // Near-field tail (zoom-to-earth fold). The step ORDER is the visible
    // "captions over bodies, bodies over cosmological labels" decision:
    //   - the foreground bodies composite (OVER) after the cosmological swap
    //     render, so the opaque Sun/Earth occlude the cosmological labels;
    //   - the near-field captions render AFTER that composite, so they land on
    //     top of the bodies.
    // The `tone` here is the SAME object the hdr→swap composite carries, which
    // is how the shared tone curve across the Sun's limb is enforced.
    { kind: 'render', target: 'foreground:0', slab: NEAR0 },
    { kind: 'composite', step: { source: 'foreground:0', dest: 'swap', blend: 'over', tone } },
    { kind: 'render', target: 'swap', slab: NEAR0 },
  ];
}

/**
 * Derive the ordered GPU-timing slot names from a program + the content-layer
 * registry (plan-time decision 5). Each step contributes:
 *
 *   - `'render'`   → the names of its matching layers (same `target` and
 *     `slab`), in registry order — one timing slot billed per layer.
 *   - `'composite'`→ a single `'<source>→<dest>'` slot (the unicode arrow),
 *     e.g. the tone-map's `'hdr→swap'`.
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
 * cosmological scalar-volume raymarch and the near-field star aggregates are
 * both "volumes & aggregates"; the two whole-texture composites and the pick
 * pass are all infra "composites & pick"; the COSMO and NEAR0 swap overlays
 * are both "overlays" — so grouping-by-title merges those (non-adjacent in
 * execution order) into one scannable seam. A groupKey with no entry here
 * degrades to its raw key as the title (self-maintaining: a genuinely new
 * target/slab step still gets its own group rather than vanishing). The value
 * order fixes the group display order — see `groupRows`.
 */
export const PASS_GROUP_TITLES: Readonly<Record<string, string>> = {
  'volume·COSMO': 'Volumes & aggregates',
  'star-aggregates·NEAR0': 'Volumes & aggregates',
  'hdr·COSMO': 'Cosmos · HDR',
  'hdr·NEAR0': 'Near field · HDR',
  'foreground:0·NEAR0': 'Foreground bodies · depth',
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
      // one groupKey covers the whole run. `?? String(step.slab)` keeps the key
      // stable if a step ever references a slab index `SLAB_NAME` doesn't cover.
      const groupKey = `${step.target}·${SLAB_NAME[step.slab] ?? String(step.slab)}`;
      for (const layer of layers) {
        if (layer.target === step.target && layer.slab === step.slab) {
          rows.push({ name: layer.name, groupKey });
        }
      }
      // One extra slot per render STEP whose NAME is the groupKey itself, so
      // the `merged` executor — which draws the whole group in one pass — has a
      // slot to attach `timestampWrites` to (a merged pass can't bill the
      // per-layer slots; those exist only for the `perLayerTimed` shape). Pushed
      // AFTER the layer loop so the group total trails its layers in draw order.
      // Emitted unconditionally (even for a step that matched no layer): the
      // step still opens a merged pass whose time we want to see. `groupKey` is
      // unique per step (each has a distinct `(target, slab)`) and never
      // collides with a layer name, so it earns its own timing slot and, in the
      // DebugPanel's grouped lists, its own row under the step's group title.
      rows.push({ name: groupKey, groupKey });
    } else if (step.kind === 'composite') {
      // A composite merges whole textures rather than projecting geometry — it
      // belongs to no slab, and all composites share the one infra group.
      rows.push({ name: `${step.step.source}→${step.step.dest}`, groupKey: 'composite' });
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
  for (const row of rows) {
    const title = titleOf(row.groupKey);
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
 * fixed `{ exposure: 1, curve: 0 }` yields the same list every real frame's
 * `frameProgram(tone)` would.
 */
export const TIMED_SLOTS: readonly string[] = timedSlotsOf(
  frameProgram({ exposure: 1, curve: 0 }),
  CONTENT_LAYERS,
);

/**
 * The real timing slots grouped for the GpuTimingsSection. Same program +
 * registry walk that orders `TIMED_SLOTS`, so a renderer that joins
 * `CONTENT_LAYERS` gets a grouped row here with zero DebugPanel edits.
 */
export const TIMED_SLOT_GROUPS: readonly TimedSlotGroup[] = timedSlotGroupsOf(
  frameProgram({ exposure: 1, curve: 0 }),
  CONTENT_LAYERS,
);

/**
 * Layer/slot name → groupKey, so a consumer holding only names (the
 * RenderTogglesSection, fed the engine handle's live togglable-pass list) can
 * project them into the same groups the timing list uses. Built from the same
 * walk, so the two lists stay positionally aligned.
 */
const PASS_GROUP_KEYS: ReadonlyMap<string, string> = new Map(
  timedSlotRowsOf(frameProgram({ exposure: 1, curve: 0 }), CONTENT_LAYERS).map((row) => [
    row.name,
    row.groupKey,
  ]),
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
