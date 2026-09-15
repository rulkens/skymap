/**
 * frameKey / sameFrame — the one frame-identity grammar (spec §2.1, §2.3).
 * `frameKey` is what the debug panel and `logCameraState` print; `sameFrame`
 * is the only equality, since two distinct `{ body }` objects can name one body.
 */

import { describe, it, expect } from 'vitest';

import { frameKey } from '../../../../../src/services/engine/camera/rungs/frameKey';
import { sameFrame } from '../../../../../src/services/engine/camera/rungs/sameFrame';
import type { PoseFrame } from '../../../../../src/@types/camera/PoseFrame';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';

const bodyId = (id: string): BodyId => id as BodyId;

describe('frameKey', () => {
  it('prefixes a body frame and leaves the world arm bare', () => {
    expect(frameKey('absolute')).toBe('absolute');
    expect(frameKey({ body: bodyId('earth') })).toBe('body:earth');
  });

  it('cannot collide across kinds', () => {
    // A body id literally 'absolute' keys as 'body:absolute' — the whole
    // reason for the prefix.
    expect(frameKey({ body: bodyId('absolute') })).toBe('body:absolute');
    expect(frameKey({ body: bodyId('absolute') })).not.toBe(frameKey('absolute'));
  });
});

describe('sameFrame', () => {
  it('joins two distinct objects naming the same body and separates two bodies', () => {
    const a: PoseFrame = { body: bodyId('earth') };
    const b: PoseFrame = { body: bodyId('earth') };
    expect(a).not.toBe(b);
    expect(sameFrame(a, b)).toBe(true);
    expect(sameFrame(a, { body: bodyId('planet') })).toBe(false);
  });
});
