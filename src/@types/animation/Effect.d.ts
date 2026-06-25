/**
 * Effect — the top-level tagged union of everything a clip timeline can contain.
 *
 * A clip's `timeline: Effect[]` is an ordered sequence of these. Every arm is a
 * plain serializable object — no functions, no class instances. The helpers in
 * `effectHelpers.ts` (Task 3) are the ONLY constructors; authors never write raw
 * `{ kind: … }` objects.
 *
 * ### Why Effect = CameraAction | SceneEffect | FocusBoundEffect | structural nodes?
 *
 * Camera motion and scene changes are independent axes: a camera tween says
 * nothing about what layers are visible, and a `show` cue says nothing about
 * where the camera is. Unioning them here keeps the timeline homogeneous (one
 * array, one type), while the discriminant `kind` lets the player split them at
 * runtime without an `instanceof` check or parallel arrays.
 *
 * `FocusBoundEffect` arms (`moveTargetId`, `dollyToId`, `focusId`) are the
 * UNRESOLVED authoring forms — they carry a `FocusId` instead of a concrete
 * `Vec3`/`SelectionRef`. They are rewritten by `resolveClipFoci` before
 * `compileClip` runs; `compileClip` throws if it ever sees one unresolved.
 *
 * The four structural nodes (`hold`, `wait`, `seq`, `all`, `fork`) compose
 * effects without nesting types: a `seq` holds a `children: Effect[]`, which can
 * itself contain `all`s and `fork`s. This recursive shape is the only reason
 * `Effect` is NOT a `.d.ts` of mutually-exclusive primitives — the self-reference
 * requires a forward declaration. TypeScript handles the recursion fine via a
 * type alias (no `interface` needed).
 *
 *   - `hold` — timed dwell: advance the clock by `sec` holding the current pose.
 *     The "pause at a meaningful scale" beat. Intentful: reads as a deliberate
 *     dwell, not just empty time.
 *
 *   - `wait` — pure timeline delay. Identical in mechanics to `hold`; the
 *     distinction is INTENT — `wait` offsets a following cue, `hold` is the beat
 *     itself.
 *
 *   - `seq` — play children IN ORDER; each starts when the previous ends.
 *
 *   - `all` — play children CONCURRENTLY; the block ends when the LONGEST child
 *     ends. The single-writer rule (one base writer per channel) is enforced here
 *     at registration time.
 *
 *   - `fork` — start `child` concurrently but do NOT wait for it; the block's
 *     duration ignores a fork. A `fork`ed perpetual `spin`/`oscillate` runs
 *     "under" the awaited timeline and is cancelled at clip end.
 *
 * ### Alternative rejected: separate `CameraEffect` and `SceneEffect` timelines
 *
 * Two parallel arrays would let the player split without discriminating on `kind`,
 * but it would prevent interleaving a camera move with a scene cue at a specific
 * beat position (e.g. "show flow exactly 5 s into the dolly"). A single timeline
 * preserves ordering semantics across both kinds.
 */

import type { CameraAction } from './CameraAction';
import type { FocusBoundEffect } from './FocusBoundEffect';
import type { SceneEffect } from './SceneEffect';

export type Effect =
  | CameraAction
  | SceneEffect
  | FocusBoundEffect
  | { readonly kind: 'hold'; readonly sec: number }
  | { readonly kind: 'wait'; readonly sec: number }
  | { readonly kind: 'seq'; readonly children: Effect[] }
  | { readonly kind: 'all'; readonly children: Effect[] }
  | { readonly kind: 'fork'; readonly child: Effect };
