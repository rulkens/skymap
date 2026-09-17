import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { SceneManifest } from '../../../../tools/scene-workbench/@types/SceneManifest';
import {
  drawOutlineRequested,
  outlineSaveRequested,
} from '../../../../tools/scene-workbench/src/state/commands';
import { manifestLoaded } from '../../../../tools/scene-workbench/src/state/group/groupSlice';
import {
  cornerAppended,
  cornerClicked,
} from '../../../../tools/scene-workbench/src/state/outline/outlineSlice';
import { commitCameraPose } from '../../../../tools/scene-workbench/src/state/view/viewSlice';
import { createSceneStore } from '../../../../tools/scene-workbench/src/store/createSceneStore';

const MANIFEST = {
  formatVersion: 1,
  groupId: 'g',
  groupName: 'G',
  anchor: { kind: 'geodetic', latDeg: 0, lonDeg: 0, heightMDvr90: 0, headingDeg: 0 },
  assets: [
    {
      kind: 'mesh',
      id: 'mesh',
      label: 'mesh',
      transform: { translationM: [0, 0, 0], rotation: [0, 0, 0, 1], scale: 1 },
      provenance: { source: 'test', sourceVintage: '2020', pipeline: [] },
      triangleCount: 1,
      artifactUrl: 'mesh.glb',
    },
  ],
} as unknown as SceneManifest;

const RETURN_POSE = {
  yaw: 0.4,
  pitch: 0.3,
  distanceM: 120,
  targetM: [1, 2, 3],
  projection: 'perspective',
} as const;

const DRAFT_RING: Vec2[] = [
  [0, 0],
  [0, 1],
  [1, 0],
];

/** A store drawing a closed triangle on `mesh`, with PUT answered by `respond`. */
async function drawingStore(respond: () => Response) {
  const put = vi.fn(respond);
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === 'PUT' ? put() : new Response('{}', { status: 404 })),
    ),
  );
  const { store } = createSceneStore();
  store.dispatch(manifestLoaded(MANIFEST));
  store.dispatch(commitCameraPose({ ...RETURN_POSE, targetM: [1, 2, 3] }));
  store.dispatch(drawOutlineRequested('mesh'));
  for (const corner of DRAFT_RING) store.dispatch(cornerAppended(corner));
  store.dispatch(cornerClicked(0));
  expect(store.getState().view.camera.projection).toBe('orthographic');
  store.dispatch(outlineSaveRequested());
  await vi.waitFor(() => expect(put).toHaveBeenCalled());
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('watchOutlineSaga', () => {
  it("save PUTs the draft, stores the server's ring and restores the return pose", async () => {
    const serverRing: Vec2[] = [
      [1, 0],
      [0, 1],
      [0, 0],
    ];
    const store = await drawingStore(
      () => new Response(JSON.stringify({ formatVersion: 1, ringM: serverRing })),
    );
    await vi.waitFor(() => expect(store.getState().outline.draft).toBeNull());
    const state = store.getState();
    expect(state.outline.byAssetId.mesh).toEqual({ ringM: serverRing, masked: true });
    expect(state.view.camera).toEqual(RETURN_POSE);
  });

  it('a failed save keeps draw mode and records the error', async () => {
    const store = await drawingStore(
      () => new Response(JSON.stringify({ error: 'outline: bad ring' }), { status: 400 }),
    );
    await vi.waitFor(() => expect(store.getState().outline.saveError).toBe('outline: bad ring'));
    const state = store.getState();
    expect(state.outline.draft).not.toBeNull();
    expect(state.view.camera.projection).toBe('orthographic');
  });
});
