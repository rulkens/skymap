/**
 * tweenToClip — carries the descriptor's `easing` onto every channel.
 *
 * `CameraTweenDescriptor.easing` (CameraTweenDescriptor.d.ts) must actually
 * reach all four channels the descriptor drives, not just be a decorative field.
 */
import { describe, it, expect } from 'vitest';

import { tweenToClip } from '../../../../src/services/engine/camera/tweenToClip';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';
import type { CameraTweenDescriptor } from '../../../../src/@types/camera/CameraTweenDescriptor';

const FROM = { target: [0, 0, 0] as [number, number, number], yaw: 0, pitch: 0, distance: 10 };
const TO = { target: [10, 20, 30] as [number, number, number], yaw: 1, pitch: 0.5, distance: 110 };
const DURATION_MS = 1000;

function descriptor(easing: CameraTweenDescriptor['easing']): CameraTweenDescriptor {
  return { from: FROM, to: TO, durationMs: DURATION_MS, easing };
}

describe("tweenToClip carries the descriptor's easing onto every channel", () => {
  it('a linear descriptor lands at the arithmetic midpoint; an easeOutCubic one does not', () => {
    const halfSec = DURATION_MS / 2 / 1000;

    const linear = evaluateClip(tweenToClip(descriptor('linear')), halfSec);
    const eased = evaluateClip(tweenToClip(descriptor('easeOutCubic')), halfSec);

    // Hand-computed: distance and target both interpolate in linear space for a
    // focus tween (tweenToClip forces space:'lin'), so under a linear ease every
    // channel sits at the plain arithmetic mean of from/to at t=0.5.
    expect(linear.distance).toBeCloseTo((FROM.distance + TO.distance) / 2, 9);
    expect(linear.yaw).toBeCloseTo((FROM.yaw + TO.yaw) / 2, 9);
    expect(linear.pitch).toBeCloseTo((FROM.pitch + TO.pitch) / 2, 9);
    expect(linear.target[0]).toBeCloseTo((FROM.target[0] + TO.target[0]) / 2, 9);
    expect(linear.target[1]).toBeCloseTo((FROM.target[1] + TO.target[1]) / 2, 9);
    expect(linear.target[2]).toBeCloseTo((FROM.target[2] + TO.target[2]) / 2, 9);

    // The two descriptors differ ONLY in `easing` — every channel must diverge,
    // proving `d.easing` reaches all four, not just a subset.
    expect(eased.distance).not.toBeCloseTo(linear.distance, 3);
    expect(eased.yaw).not.toBeCloseTo(linear.yaw, 3);
    expect(eased.pitch).not.toBeCloseTo(linear.pitch, 3);
    expect(eased.target[0]).not.toBeCloseTo(linear.target[0], 3);
    expect(eased.target[1]).not.toBeCloseTo(linear.target[1], 3);
    expect(eased.target[2]).not.toBeCloseTo(linear.target[2], 3);
  });
});
