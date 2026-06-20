/**
 * cameraDriverShape — pin the CameraDriver interface to exactly four members.
 *
 * The driver type is deliberately minimal: `id`, `priority`, `isActive`, `pose`.
 * No `enter` / `exit` lifecycle hooks, no `update` method, no shared state. The
 * absence of lifecycle hooks is load-bearing: the resolver (a pure max-scan) is
 * stateless and side-effect-free, which means drivers can be reordered, replaced,
 * or added at any point without coordinating teardown or initialisation.
 *
 * These tests pin the shape at compile time (via `@ts-expect-error`) and at
 * runtime (via keyof count). They exist so a future author who wants to add a
 * lifecycle hook gets a clear 'this is intentional, not an oversight' signal.
 */

import { describe, it, expect } from 'vitest';
import type { CameraDriver } from '../../../../src/@types/engine/camera/CameraDriver';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { RootState } from '../../../../src/store/types';

describe('CameraDriver shape', () => {
  it('has exactly four members: id, priority, isActive, pose', () => {
    // Build a conforming driver so tsc validates the shape at compile time.
    const driver: CameraDriver = {
      id: 'test',
      priority: 0,
      isActive: (_s: RootState) => false,
      pose: (_s: RootState, _cam: OrbitCamera, _e: number): CameraPose => ({
        target: [0, 0, 0],
        yaw: 0,
        pitch: 0,
        distance: 1,
      }),
    };

    // Runtime check: Object.keys on a conforming literal with no extras should
    // have exactly four keys.
    const keys = Object.keys(driver);
    expect(keys).toHaveLength(4);
    expect(keys).toContain('id');
    expect(keys).toContain('priority');
    expect(keys).toContain('isActive');
    expect(keys).toContain('pose');
  });

  it('does not accept unknown fields (no lifecycle hooks)', () => {
    const _bad: CameraDriver = {
      id: 'bad',
      priority: 0,
      isActive: () => false,
      pose: () => ({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 }),
      // @ts-expect-error — 'enter' is not a member of CameraDriver; adding lifecycle
      // hooks would change the contract. If this error disappears, the type grew an
      // unintended member.
      enter: () => {},
    };
  });
});
