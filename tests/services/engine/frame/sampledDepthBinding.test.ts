/**
 * sampledDepthBinding — the far-placeholder rule three call sites used to
 * copy inline (spec `2026-09-21-local-froxel-aerial-perspective-design.md`):
 * an unresolvable frame must arrive bound to the far-cleared placeholder
 * view, never the real texture.
 */

import { describe, it, expect } from 'vitest';

import { sampledDepthBinding } from '../../../../src/services/engine/frame/sampledDepthBinding';
import { makeSlab } from '../../../fixtures/makeSlab';

import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';

const FAR_DEPTH_VIEW = { label: 'far-placeholder' } as unknown as GPUTextureView;
const ROW_DEPTH_VIEW = { label: 'foreground:0-depth' } as unknown as GPUTextureView;

const RENDER_TARGETS = {
  farDepthView: () => FAR_DEPTH_VIEW,
} as unknown as ReadyFrameContext['renderTargets'];

// Resolves every body — sampledDepthKmFrame only returns null when the row
// itself is unresolvable (no row, non-body-m, or the pose lookup below fails).
const RESOLVES_EVERY_BODY = ((bodyId: string) =>
  bodyId === 'earth'
    ? { eyeRelBodyM: [1, 2, 3], basisM: [1, 0, 0, 0, 1, 0, 0, 0, 1] }
    : null) as unknown as ReadyFrameContext['bodyPose'];

describe('sampledDepthBinding', () => {
  it('binds the far placeholder and a null frame when sampledDepth is undefined', () => {
    const binding = sampledDepthBinding(undefined, RESOLVES_EVERY_BODY, RENDER_TARGETS);
    expect(binding.frame).toBeNull();
    expect(binding.view).toBe(FAR_DEPTH_VIEW);
  });

  it('binds the far placeholder, not the real view, when the row cannot be unprojected', () => {
    // A body the pose provider cannot place (here: 'mars') — sampledDepthKmFrame
    // returns null, and the placeholder rule must still route the view.
    const row = makeSlab({ frame: { kind: 'body-m', bodyId: 'mars' as BodyId } });
    const binding = sampledDepthBinding(
      { view: ROW_DEPTH_VIEW, row },
      RESOLVES_EVERY_BODY,
      RENDER_TARGETS,
    );
    expect(binding.frame).toBeNull();
    expect(binding.view).toBe(FAR_DEPTH_VIEW);
  });

  it('binds the real view alongside a non-null frame for a resolvable row', () => {
    const row = makeSlab({ frame: { kind: 'body-m', bodyId: 'earth' } });
    const binding = sampledDepthBinding(
      { view: ROW_DEPTH_VIEW, row },
      RESOLVES_EVERY_BODY,
      RENDER_TARGETS,
    );
    expect(binding.frame).not.toBeNull();
    expect(binding.view).toBe(ROW_DEPTH_VIEW);
  });
});
