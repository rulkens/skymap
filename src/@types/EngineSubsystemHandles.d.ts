/**
 * EngineSubsystemHandles — the long-lived owned-helpers sub-bag of the
 * canonical `EngineState`.
 *
 * ### What's a subsystem here?
 *
 * "Subsystem" is the project's term for a self-contained facade that
 * owns its own internal mutable state and exposes a small imperative
 * API (`runFrame`, `apply`, `connect`, etc.) that the engine drives
 * once per relevant event.  The thumbnail pipeline, SpaceMouse input,
 * camera tweens, click resolution, input bindings, and render
 * scheduling are each one — each one was originally a 100+ line block
 * inside `engine.ts` that got extracted during Phases 1–3 of the
 * refactor.
 *
 * ### Why some fields are null at construction
 *
 * Two construction phases:
 *
 *   - Up-front (before the async GPU IIFE runs): `spaceMouse`, `tweens`,
 *     `scheduler`.  None of these need a GPU device — their callbacks
 *     queue work that the scheduler will pick up once the IIFE finishes.
 *   - Lazy (inside the IIFE): `thumbnails` (needs the GPU device + the
 *     QuadRenderer / DiskRenderer pair), `clickResolver` (needs the
 *     pick renderer), `inputBindings` (needs the scheduler so it can
 *     wake the loop on input).  These start as null.
 *
 * The mixed nullability here matches the GPU handles bag — see
 * `EngineGpuHandles.d.ts` for the same rationale (consumer null-checks
 * stay honest, destroy() can null them back out symmetrically).
 *
 * ### Why a separate type
 *
 * Same as the other state sub-bags: lets per-frame helpers (`renderFrame`,
 * the click handler) accept exactly the subsystem slice they touch
 * rather than the whole engine state.
 */

import type { ThumbnailSubsystem } from '../services/engine/thumbnailSubsystem';
import type { SpaceMouseSubsystem } from '../services/engine/spaceMouseSubsystem';
import type { TweenManager } from '../services/engine/tweenManager';
import type { ClickResolver } from '../services/engine/clickHandler';
import type { InputBindings } from '../services/engine/inputBindings';
import type { RenderScheduler } from '../services/engine/renderScheduler';

export type EngineSubsystemHandles = {
  thumbnails: ThumbnailSubsystem | null;
  spaceMouse: SpaceMouseSubsystem;
  tweens: TweenManager;
  clickResolver: ClickResolver | null;
  inputBindings: InputBindings | null;
  scheduler: RenderScheduler;
};
