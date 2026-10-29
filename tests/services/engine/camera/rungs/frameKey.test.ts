/**
 * frameKey / sameFrame — the one frame-identity grammar (spec §2.1, §2.3).
 * `frameKey` is what the debug panel and `logCameraState` print; `sameFrame`
 * is the only equality, since two distinct `{ body }` objects can name one body.
 */

import { describe, it, expect } from 'vitest';

import { frameKey } from '../../../../../src/services/engine/camera/rungs/frameKey';
import { sameFrame } from '../../../../../src/services/engine/camera/rungs/sameFrame';
import type { PoseFrame } from '../../../../../src/@types/camera/PoseFrame';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';

describe('frameKey', () => {
  it('prefixes a body frame and leaves the world arm bare', () => {
    expect(frameKey('absolute')).toBe('absolute');
    expect(frameKey({ body: asSceneBodyId('earth') })).toBe('body:earth');
  });

  it('cannot collide across kinds', () => {
    // A body id literally 'absolute' keys as 'body:absolute' — the whole
    // reason for the prefix.
    expect(frameKey({ body: asSceneBodyId('absolute') })).toBe('body:absolute');
    expect(frameKey({ body: asSceneBodyId('absolute') })).not.toBe(frameKey('absolute'));
  });
});

describe('sameFrame', () => {
  it('joins two distinct objects naming the same body and separates two bodies', () => {
    const a: PoseFrame = { body: asSceneBodyId('earth') };
    const b: PoseFrame = { body: asSceneBodyId('earth') };
    expect(a).not.toBe(b);
    expect(sameFrame(a, b)).toBe(true);
    expect(sameFrame(a, { body: asSceneBodyId('planet') })).toBe(false);
  });
});
