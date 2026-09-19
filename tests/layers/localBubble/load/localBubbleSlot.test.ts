/**
 * localBubbleSlot — checks the slot's `onRelease` actually frees the
 * renderer's GPU buffers (the inverse of its `commit`), driven through the
 * real slot machinery with a stubbed fetch.
 */

import { describe, expect, it, vi } from 'vitest';

import { createLocalBubbleSlot } from '../../../../src/layers/localBubble/load/localBubbleSlot';
import { encodeShellMesh } from '../../../../src/data/shellMesh/shellMeshFormat';
import { useFetchMock } from '../../../setup/fetchMock';
import type { LocalBubbleRenderer } from '../../../../src/@types/rendering/LocalBubbleRenderer';

const fetch = useFetchMock();

function fixtureBuffer(): ArrayBuffer {
  return encodeShellMesh({
    dtype: 'f32',
    frame: 'galactic',
    centrePc: [0, 0, 0],
    positions: new Float32Array([0, 0, 300, 1]),
    normals: new Float32Array([0, 0, 1, 0]),
    indices: new Uint32Array([0, 0, 0]),
  });
}

function makeRenderer(): LocalBubbleRenderer {
  return {
    label: 'stub',
    upload: vi.fn(),
    hasMesh: vi.fn(),
    clearMesh: vi.fn(),
    draw: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('createLocalBubbleSlot', () => {
  it('release() frees the renderer buffers via onRelease', async () => {
    fetch.mock.mockResolvedValue(new Response(fixtureBuffer(), { status: 200 }));
    const renderer = makeRenderer();
    const slot = createLocalBubbleSlot(renderer);

    slot.load();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    expect(renderer.upload).toHaveBeenCalledTimes(1);

    slot.release();
    expect(renderer.clearMesh).toHaveBeenCalledTimes(1);
  });
});
