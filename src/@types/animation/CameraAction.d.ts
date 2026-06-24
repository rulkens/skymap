/**
 * CameraAction — the tagged-union of camera-pose mutations a clip can author.
 *
 * Every arm is a plain serializable object: no functions, no class instances,
 * no closures. The evaluator reads them as data; `effectHelpers.ts` (Task 3)
 * is the ONLY place that constructs them — authors never write raw `{ kind: … }`
 * objects by hand.
 *
 * ### Why four kinds?
 *
 * A channel's value is the sum of three independent layers (base + vel + osc).
 * The four kinds correspond to three distinct roles:
 *
 *   - `set` / `setVec` — base-layer writers. Absolute position: move THIS channel
 *     TO this value over N seconds. Two overlapping base writers on the same
 *     channel clash (caught at registration time by `validateSingleWriter`).
 *
 *   - `spin` — also a base-layer writer, but additive: "rotate BY this amount"
 *     rather than "go TO this bearing". `loop: true` makes it perpetual (no
 *     completion) — the orbit idiom.
 *
 *   - `rate` — velocity-layer writer. Ramps the channel's angular/linear rate to
 *     `to` over `over` seconds, then holds that rate. Integrates in closed form
 *     (no accumulator), so the result is frame-rate-independent and scrubable.
 *     Additive with the base layer; never clashes with `set` or `spin`.
 *
 *   - `osc` — oscillation-layer writer. Additive zero-mean sine: `amp · sin(2π t /
 *     period)`. The gentle bob / "life during a hold" idiom. Never clashes with
 *     base or vel.
 *
 * ### Why `setVec` as a separate arm?
 *
 * `target` is a Vec3 channel — it moves as a unit (you never want X-only panning
 * while Y freezes). Splitting `target` into three scalar channels would make
 * `moveTarget` emit three `set` actions, require the evaluator to re-assemble
 * them, and force the single-writer check onto sub-channels instead of the
 * channel itself. One `setVec` arm keeps `target` as one action, lets the
 * evaluator lerp component-wise, and leaves the other three channels (`distance`,
 * `yaw`, `pitch`) as scalars covered by `set`. `space` is fixed `'lin'` for Vec3
 * (world coordinates are signed; `log` would be undefined on negatives).
 *
 * ### Alternative rejected: a generic `payload: number | Vec3` field
 *
 * A single `set` arm with a union payload would let `set('yaw', Vec3)` compile.
 * Separate arms make the type-narrowing trivial, let the evaluator dispatch without
 * runtime `instanceof` or `Array.isArray` checks, and surface the misuse at
 * authoring time rather than at evaluation time.
 */

import type { Channel } from './Channel';
import type { Ease } from './Ease';
import type { Space } from './Space';
import type { Vec3 } from '../math/Vec3';

export type CameraAction =
  | {
      readonly kind: 'set';
      readonly ch: 'distance' | 'yaw' | 'pitch';
      readonly to: number;
      readonly over: number;
      readonly ease: Ease;
      readonly space: Space;
    }
  | {
      readonly kind: 'setVec';
      readonly ch: 'target';
      readonly to: Vec3;
      readonly over: number;
      readonly ease: Ease;
      readonly space: 'lin';
    }
  | {
      readonly kind: 'spin';
      readonly ch: Channel;
      readonly by: number;
      readonly over: number;
      readonly ease: Ease;
      readonly loop?: boolean;
    }
  | {
      readonly kind: 'rate';
      readonly ch: Channel;
      readonly to: number;
      readonly over: number;
      readonly ease: Ease;
    }
  | {
      readonly kind: 'osc';
      readonly ch: Channel;
      readonly amp: number;
      readonly period: number;
    };
