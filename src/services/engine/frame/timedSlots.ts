/**
 * The engine's ordered GPU-timing slots, derived from the SAME `FRAME_ORDER`
 * expansion the executor walks, so the query-set allocation and the DebugPanel
 * can never see a slot list the frame does not run. Expanded with MAXIMAL
 * inputs (every capture face, the longest foreground chain, every lensing row)
 * because the query set is sized once at boot while a real frame's lists are
 * shorter — an unused slot simply reads zero. The grouped projections are
 * further projections of that one walk, so a slot's display group cannot drift
 * from its position in draw order.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { FrameStep } from '../../../@types/engine/frame/FrameStep';
import type { FrameInputs } from './expandFrameOrder';
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import type { ToneMap } from '../../../@types/rendering/ToneMap';
import {
  COSMO,
  NEAR0,
  groupKeyOf,
  passTimingSlotName,
  renderStepTimingSlotName,
  slabName,
} from './slabs';
import { expandFrameOrder } from './expandFrameOrder';
import { FRAME_ORDER } from './frameOrder';
import { CONTENT_PASSES } from './passes';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';
import { SCENE_ANCHOR_POINT_BODIES } from '../../../data/bodies/sceneAnchorPointBodies';

/**
 * Upper bound on body rows `deriveSlabs` can emit in one frame: Earth (the
 * NEAR0-adjacent body baked into `earthPass`, not a `SCENE_PLANETS` row) plus
 * every `SCENE_PLANETS` and `SCENE_ANCHOR_POINT_BODIES` entry. One slot is
 * allocated per capacity row, not per row actually drawn, so the query-set size
 * is a compile-time constant — see `createGpuTimingService`.
 */
export const BODY_SLAB_CAPACITY = 1 + SCENE_PLANETS.length + SCENE_ANCHOR_POINT_BODIES.length;

/**
 * The ordered slot names: per render step one slot per pass it draws then the
 * step's group total; per composite a `'<source>→<dest>'` slot (the unicode
 * arrow); one `'bloom'`; nothing for a compute. `'pick'` is appended last,
 * matching the frame's execution order.
 */
export function timedSlotsOf(program: readonly FrameStep[]): readonly string[] {
  return timedSlotRowsOf(program).map((row) => row.name);
}

/**
 * One derived timing slot: its `name` (what the timing service allocates a
 * query pair for) plus the `groupKey` of the step that produced it —
 * `'<target>·<SLAB>'` for a render slot, the literal `'composite'` for a
 * whole-texture merge, `'pick'` for the pick program. The DebugPanel buckets on
 * the groupKey, so a new pass lands in the right group via its step.
 */
export type TimedSlotRow = { readonly name: string; readonly groupKey: string };

/**
 * A run of timed slots the two DebugPanel lists render under one header: a
 * human `title` (from `PASS_GROUP_TITLES`, or the raw groupKey as fallback)
 * and the slots that map to it, in draw order.
 */
export type TimedSlotGroup = { readonly title: string; readonly rows: readonly TimedSlotRow[] };

/**
 * groupKey → human group title, the value order fixing the display order (see
 * `groupRows`). Steps sharing a title merge into one scannable seam even when
 * non-adjacent in execution order — that is why the volume raymarch and the two
 * aggregate offscreens, or the two composites and pick, each collapse to one
 * group. A groupKey with no entry here degrades to its raw key as the title, so
 * a genuinely new target/slab step still gets a group rather than vanishing.
 */
export const PASS_GROUP_TITLES: Readonly<Record<string, string>> = {
  'volume·COSMO': 'Volumes & aggregates',
  'zoa·COSMO': 'Volumes & aggregates',
  'star-aggregates·NEAR0': 'Volumes & aggregates',
  'mw-aggregate·NEAR0': 'Volumes & aggregates',
  // The black-hole lens's sky-cubemap bake steps — 0 or 12 of them per frame
  // (COSMO + NEAR0 per face, all six or none), so its own group rather than
  // folding into an existing title.
  'sky-cubemap·COSMO': 'Sky capture',
  'sky-cubemap·NEAR0': 'Sky capture',
  'hdr·COSMO': 'Cosmos · HDR',
  'hdr·NEAR0': 'Near field · HDR',
  // One `hdr·BODY[k]` row per capacity slot — today only the black-hole lens
  // (`sgrAStarLensingPass`) targets `hdr` on a body-m slab, so every slot
  // buckets under one title regardless of which row Sgr A* lands in this
  // frame, same reasoning as the `foreground:0·BODY[k]` block below.
  ...Object.fromEntries(
    Array.from({ length: BODY_SLAB_CAPACITY }, (_, k) => [
      `hdr·${slabName(k + 2)}`,
      'Sgr A* lensing',
    ]),
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
 * order — a new pass joins them all at once.
 */
function timedSlotRowsOf(program: readonly FrameStep[]): readonly TimedSlotRow[] {
  const rows: TimedSlotRow[] = [];
  for (const step of program) {
    if (step.kind === 'render') {
      // Every pass this step draws shares the step's `(target, slab)`, so one
      // groupKey covers the whole run. The key comes from the shared
      // `groupKeyOf` helper (slabs.ts) — the same definition the executor
      // resolves against, so the two can't drift.
      const groupKey = groupKeyOf(step.target, step.slab);
      for (const contentPass of step.passes) {
        // `passTimingSlotName` carries the body row and the capture face into
        // the slot NAME, so two body rows sharing one pass (Jupiter + a moon,
        // both drawn by `planetsPass`) — or one roster pass drawn once per
        // captured face and once for the real view — each get their own
        // query-set slot instead of colliding on the same two indices (see its
        // doc, slabs.ts).
        rows.push({
          name: passTimingSlotName(contentPass.name, step.slab, step.face),
          groupKey,
        });
      }
      // One extra slot per render STEP named for the groupKey itself, so the
      // `merged` executor — one pass for the whole group — has a slot to attach
      // `timestampWrites` to; the per-pass slots are the `perLayerTimed` shape's
      // alone. Pushed AFTER the pass loop so the total trails its passes.
      // `groupKey` alone is NOT unique across steps — all 6 capture faces share
      // `('sky-cubemap', NEAR0)`, and several `FRAME_ORDER` lines share
      // `(hdr, NEAR0)` — so `renderStepTimingSlotName` appends the face or the
      // line's authored `slot`. The DebugPanel still buckets on the bare
      // `groupKey`, so those all land under one title each.
      rows.push({ name: renderStepTimingSlotName(groupKey, step.face, step.slot), groupKey });
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
export function timedSlotGroupsOf(program: readonly FrameStep[]): readonly TimedSlotGroup[] {
  return groupRows(timedSlotRowsOf(program));
}

/**
 * A placeholder tone: a slot NAME never reads the composite's `tone`, so a
 * fixed value yields the same list every real frame's expansion would.
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

/**
 * `bloomEnabled: true` so the query-set allocation always includes the
 * `'bloom'` slot. It costs nothing on frames where bloom is off — the master
 * toggle omits the step and `runBloom` also no-ops on a null `bloomPyramid`, so
 * the pre-allocated slot simply goes unused, like any empty group's slot.
 */
const MAX_FRAME_INPUTS: FrameInputs = {
  tone: PLACEHOLDER_TONE,
  bloomEnabled: true,
  foregroundChain: MAX_FOREGROUND_CHAIN,
  skyCubemapFacesToCapture: ALL_CUBE_FACES,
  lensBodySlabs: MAX_SGR_A_STAR_LENSING_BODY_SLABS,
};

/**
 * The maximal expansion all three projections below walk — one expansion, so
 * they cannot disagree about which steps exist.
 */
const MAX_PROGRAM: readonly FrameStep[] = expandFrameOrder(
  FRAME_ORDER,
  CONTENT_PASSES,
  MAX_FRAME_INPUTS,
);

/**
 * The engine's ordered GPU-timing slots — the single source of truth for both
 * query-set slot allocation (`createGpuTimingService`) and DebugPanel display
 * order (`GpuTimingsSection`).
 */
export const TIMED_SLOTS: readonly string[] = timedSlotsOf(MAX_PROGRAM);

/**
 * The real timing slots grouped for the GpuTimingsSection. Same walk that
 * orders `TIMED_SLOTS`, so a pass that joins `CONTENT_PASSES` and its
 * `FRAME_ORDER` line gets a grouped row here with zero DebugPanel edits.
 */
export const TIMED_SLOT_GROUPS: readonly TimedSlotGroup[] = timedSlotGroupsOf(MAX_PROGRAM);

/**
 * Plain `contentPass.name` → groupKey — a SEPARATE walk from `timedSlotRowsOf`,
 * because the engine handle's `allNames` (what `groupPassNames` below
 * actually receives) is `CONTENT_PASSES.map(l => l.name)`: one entry per
 * REGISTERED layer, never per-body-row (toggling a layer disables it on
 * every row it draws — see `RenderTogglesSection`'s one-way override doc).
 * A `slab: 'body'` layer's plain name therefore matches every body-row step
 * here; later occurrences simply overwrite earlier ones in the built map,
 * which is harmless — `PASS_GROUP_TITLES` maps every `<target>·BODY[k]`
 * groupKey to the SAME title, so whichever row the last occurrence lands on
 * resolves to the identical display group.
 */
function plainPassGroupKeys(program: readonly FrameStep[]): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const step of program) {
    if (step.kind !== 'render') continue;
    const groupKey = groupKeyOf(step.target, step.slab);
    for (const contentPass of step.passes) map.set(contentPass.name, groupKey);
  }
  return map;
}

/**
 * Layer name → groupKey, so a consumer holding only PLAIN names (the
 * RenderTogglesSection, fed the engine handle's live togglable-pass list) can
 * project them into the same groups the timing list uses.
 */
const PASS_GROUP_KEYS: ReadonlyMap<string, string> = plainPassGroupKeys(MAX_PROGRAM);

/**
 * Group an arbitrary ordered name list (the DebugPanel toggles' live pass
 * names) into the same display groups as the timing list. A name with no known
 * groupKey (e.g. a stale/removed pass) falls back to a group titled with the
 * name itself rather than being dropped.
 */
export function groupPassNames(names: readonly string[]): readonly TimedSlotGroup[] {
  return groupRows(names.map((name) => ({ name, groupKey: PASS_GROUP_KEYS.get(name) ?? name })));
}
