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
 *   - **It never writes settings.** `row.writeIntent` is the settings-mutating
 *     half; the push setters (which hold the React-notifying SettingsStore
 *     handle) own that write. `applyIntent` only *reads* intent and reacts to
 *     it, so driving it never desyncs settings from the toggle that set them.
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
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';

// The state slice applyIntent feeds the row closures. `row.guard` reads
// `assetSlots` (slotReady); `row.post` reads `settings` (volume lazy-load) and,
// for the survey row, recomputes the masks via `deriveSourceMasks`, which reads
// `sources` + `subsystems` too. This Pick is the union of all of those.
type ApplyIntentState = Pick<EngineState, 'settings' | 'subsystems' | 'assetSlots' | 'sources'>;

/**
 * Apply one row's intent to one of its items as a single fade.
 *
 * Order: guard → read intent → fade (animated or immediate) → post. Only ever
 * called on intent rows, so `row.intent` is always present.
 */
function applyIntent<Item>(
  state: ApplyIntentState,
  row: FadeLayer<Item>,
  item: Item,
  opts: { animate: boolean },
): void {
  // `FadeLayer.guard`/`post` are typed against the full EngineState, but
  // applyIntent only ever feeds them the clusters they actually read (named in
  // ApplyIntentState). The cast narrows the type-mismatch at exactly these two
  // call boundaries; the runtime objects carry the fields the closures touch.
  if (row.guard?.(state as EngineState, item) === false) return;

  // applyIntent is only ever called on intent rows, so `intent` is present.
  const target = row.intent!(state.settings, item) ? 1 : 0;

  if (opts.animate) {
    // fadeTo wakes the scheduler itself; fire-and-forget (last-issued wins).
    void state.subsystems.fades.fadeTo(
      row.handle(item),
      target,
      target === 1 ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
    );
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
