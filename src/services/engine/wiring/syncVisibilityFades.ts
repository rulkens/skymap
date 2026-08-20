/**
 * syncVisibilityFades — the intent → fade bridge.
 *
 * This module turns a row's *intent* (the boolean a user or a tour toggles,
 * read from settings via `row.intent`) into a *fade* on that row's handle. It
 * is the consumer side of the `FadeLayer` manifest's intent fields, the mirror
 * of `seedFades` (which consumes the registration fields).
 *
 * ### `applyIntent` is the private per-row operation — fades ONLY
 *
 * `applyIntent` is the single-row primitive: given a row and one of its items,
 * it reads the row's intent and drives exactly one fade (animated or snapped).
 * It deliberately does NOT do three things that belong to the public batch
 * bridge:
 *
 *   - **It never writes settings.** It only *reads* intent and drives a fade;
 *     the settings write is owned by the push setters (the store actions that
 *     hold the React-notifying SettingsStore handle) and the restore path. So
 *     driving it never desyncs settings from the toggle that set them.
 *   - **It never wakes the scheduler.** `fadeTo` already wakes the render loop
 *     unconditionally, and the public bridge issues a single batch wake; a wake
 *     here would be redundant. (`setImmediate` deliberately does NOT wake — a
 *     snap is a frame-1 / non-animated path, and the caller schedules a render
 *     if one is needed.)
 *   - **It never echoes to React.** State flows one way: settings → intent →
 *     fade. React reads visibility from its own settings projection.
 *
 * Keeping `applyIntent` fades-only is what lets the public `syncVisibilityFades`
 * (added alongside) own the single batch wake + the settings-write policy in one
 * place, instead of every per-row call re-deciding those.
 *
 * ### Why `guard` short-circuits before everything
 *
 * A demand-loaded row (e.g. flow) suppresses its fade until its asset slot has
 * committed — otherwise a toggle while the slot is still idle would fade in
 * nothing and then run `post` against a half-built layer. So an explicit
 * `guard(...) === false` returns before the fade AND before `post`. A row with
 * no `guard` is never suppressed: absence means "always apply", only an explicit
 * `false` skips.
 */

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { VisibilityLayerKey } from '../../../@types/animation/VisibilityLayerKey';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import { FADE_LAYERS } from './fadeLayers';

// The state slice applyIntent feeds the row closures. `row.guard` reads `gpu`
// (the flow row asks the renderer's `fieldLoaded()`); `row.post` reads `settings`
// (the volumeField row's lazy-load). `intent` reads `settings`; the fade calls go
// through `subsystems.fades` / `subsystems.scheduler`. `assetSlots` is kept
// because other guards/posts may reach a slot. This Pick is the union: no row
// closure reads a source-loading bag — the survey row's mask-recompute `post`
// is gone, and the tier it once needed lives in the `tier` root slice.
export type ApplyIntentState = Pick<EngineState, 'settings' | 'subsystems' | 'assetSlots' | 'gpu'>;

/**
 * Apply one row's intent to one of its items as a single fade.
 *
 * Order: guard → read intent → fade (animated or immediate) → post. Only ever
 * called on intent rows, so `row.intent` is always present.
 *
 * `opts.durationMs` overrides the hard-coded `FADE_IN/OUT_DURATION_MS` for the
 * animated path. When omitted, the defaults apply unchanged. The snap path
 * (`animate: false`) ignores `durationMs` — `setImmediate` has no duration.
 */
function applyIntent<Item>(
  state: ApplyIntentState,
  row: FadeLayer<Item>,
  item: Item,
  opts: { animate: boolean; durationMs?: number },
): void {
  // `FadeLayer.guard`/`post` are typed against the full EngineState, but
  // applyIntent only ever feeds them the clusters they actually read (named in
  // ApplyIntentState). The cast narrows the type-mismatch at exactly these two
  // call boundaries; the runtime objects carry the fields the closures touch.
  if (row.guard?.(state as EngineState, item) === false) return;

  // applyIntent is only ever called on intent rows, so `intent` is present.
  const target = row.intent!(state.settings, item) ? 1 : 0;

  if (opts.animate) {
    // When a caller supplies durationMs (e.g. a clip cue with a custom `over`),
    // use it; otherwise fall back to the perception-tuned defaults.
    const dur = opts.durationMs ?? (target === 1 ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS);
    // fadeTo wakes the scheduler itself; fire-and-forget (last-issued wins).
    void state.subsystems.fades.fadeTo(row.handle(item), target, dur);
  } else {
    // setImmediate snaps without waking — the caller schedules a render if needed.
    state.subsystems.fades.setImmediate(row.handle(item), target);
  }

  row.post?.(state as EngineState, item);
}

// Test-only alias matching the import name used in tests. applyIntent is not
// part of the public bridge API — it's the private per-row op, exposed only so
// its fades-only behaviour can be driven in isolation.
export { applyIntent as applyIntentForTest };

/**
 * The single public intent → fade bridge. Walks the manifest's INTENT SUBSET
 * (the rows that carry an `intent` closure — the registration-only overlay/
 * scaleBar rows have none and are skipped) and drives one fade per item via the
 * private `applyIntent`. With `opts.only`, the subset is further narrowed to the
 * named keys, so a caller (e.g. a tour cue) can sync just one layer.
 *
 * Does fades ONLY: no settings writes (those belong to the push setters /
 * restore path), no React echoes. State flows one way here — settings → intent →
 * fade.
 *
 * `opts.durationMs` is forwarded to every per-row `applyIntent` call, overriding
 * the hard-coded `FADE_IN/OUT_DURATION_MS` for the animated path. When omitted,
 * the defaults apply unchanged — all existing callers are unaffected.
 *
 * ### Why the wake is asymmetric
 *
 * `applyIntent` itself never wakes the scheduler; the wake is the whole reason
 * this batch bridge exists on top of it, and the two animate modes need opposite
 * treatment:
 *
 *   - `animate: false` snaps via `setImmediate`, which deliberately does NOT
 *     wake the loop (a snap is a frame-1 / non-animated path). So after the
 *     ENTIRE batch we issue exactly one `requestRender` to draw the snapped
 *     state once — one wake for the whole batch, not one per item.
 *   - `animate: true` drives `fadeTo`, which wakes the scheduler itself per the
 *     registry's contract. A batch wake here would be redundant, so we issue
 *     none.
 */
export function syncVisibilityFades(
  state: ApplyIntentState,
  opts: { animate: boolean; only?: readonly VisibilityLayerKey[]; durationMs?: number },
): void {
  const only = opts.only ? new Set(opts.only) : undefined;

  for (const row of FADE_LAYERS) {
    // The registration-only rows (proceduralDisks/texturedDisks/scaleBar) have
    // no intent to sync — skip them.
    if (row.intent === undefined) continue;
    // Narrow to the requested keys when `only` is given.
    if (only && !only.has(row.key)) continue;

    // `expand` is typed against the full EngineState but the manifest's expands
    // are constants that read nothing from state — same boundary cast as the
    // guard/post calls inside applyIntent.
    for (const item of row.expand(state as EngineState)) {
      applyIntent(state, row, item, { animate: opts.animate, durationMs: opts.durationMs });
    }
  }

  // One batch wake for the snap path; the animated path rides fadeTo's own wake.
  if (!opts.animate) state.subsystems.scheduler.requestRender();
}

/**
 * Apply ONE row's intent to ONE item — the scoped sibling of `syncVisibilityFades`.
 *
 * Where the batch bridge sweeps every item a row expands to (`only` narrows by
 * ROW, so `only: ['survey']` still drives ALL survey catalogs), this entry drives
 * exactly the single item named. The galaxy-catalog slot commit needs that: a
 * tier swap reloads every visible source concurrently, and each source's commit
 * must fade in ONLY the catalog it just uploaded. Routing its fade-in through the
 * batch bridge would have source A's commit re-drive source B's fade while B's own
 * commit is mid-dissolve — they'd race ("last-issued wins") and B would visibly
 * flicker up then down.
 *
 * `item` is `unknown` because the row is erased to `FadeLayer<unknown>` in
 * FADE_LAYERS. The row's handle/intent/post all consume the item the row was
 * authored for, so the caller passes the matching item for `key` — the same
 * soundness argument as the batch's per-row loop, which feeds `applyIntent` items
 * typed `unknown` straight from `row.expand`.
 *
 * `opts.durationMs` overrides the hard-coded `FADE_IN/OUT_DURATION_MS` for the
 * animated path, matching the batch bridge's override semantics. Omitting it
 * preserves existing default behaviour.
 */
export function syncVisibilityFadeItem(
  state: ApplyIntentState,
  key: VisibilityLayerKey,
  item: unknown,
  opts: { durationMs?: number },
): void {
  const row = FADE_LAYERS.find((r) => r.key === key);
  // Registration-only keys have no intent to apply — skip, the same way the
  // batch loop skips intent-less rows. A non-intent key here is a caller bug.
  if (row === undefined || row.intent === undefined) return;

  applyIntent(state, row, item, { ...opts, animate: true });
}
