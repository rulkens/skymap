/**
 * watchRegistrySaga — loads `scenes.json` (the group picker's list) at boot
 * and on an explicit reload. A 404 is the EMPTY STATE, not an error: a
 * checkout that has never run `npm run bake-lidar` has no `geo3d/` tree at
 * all, and the UI's empty state names the commands that create one.
 * `loadDataManifest()` first, because `dataUrl` resolves through the
 * boot-fetched manifest and returns the unhashed path until it lands.
 * `?probe` (probeGpuErrors.ts) swaps the fetch for a synthetic one-group
 * registry (`syntheticProbeScene.ts`) instead, via the `fetch` shim below.
 */
import { call, put, takeLatest } from 'typed-redux-saga';

import { dataUrl } from '../../../../../src/services/loading/fetchWithProgress';
import { loadDataManifest } from '../../../../../src/services/loading/dataManifest';
import { hasUrlGate } from '../../../../../src/utils/url/hasUrlGate';
import type { GroupRegistry } from '../../../@types/GroupRegistry';
import { reloadRegistryRequested } from '../commands';
import { sagaContextRegistered } from '../../store/sagaContextRegistered';
import { syntheticProbeScene } from '../../scene/syntheticProbeScene';
import { groupSelected, registryFailed, registryLoaded, registryLoading } from './registrySlice';

let probeBlobFetchInstalled = false;

/**
 * `dataUrl()` always mangles its argument into `${base}/data/${arg}`, so the
 * blob: URLs `syntheticProbeScene()` hands out as `manifestUrl`/`artifactUrl`
 * only resolve if that mangled request gets unwrapped back to the bare blob:
 * URL it still ends with. Installed once; every other fetch (the real app
 * shell, real assets) passes straight through untouched.
 */
function installProbeBlobFetchShim(): void {
  if (probeBlobFetchInstalled) return;
  probeBlobFetchInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requested =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const blobAt = requested.indexOf('blob:');
    return originalFetch(blobAt === -1 ? input : requested.slice(blobAt), init);
  }) as typeof window.fetch;
}

function* loadRegistryWorker() {
  try {
    yield* put(registryLoading());
    if (hasUrlGate('probe')) {
      installProbeBlobFetchShim();
      const entry = syntheticProbeScene();
      yield* put(registryLoaded([entry]));
      yield* put(groupSelected(entry.id));
      return;
    }
    yield* call(loadDataManifest);
    const registry = yield* call(() =>
      fetch(dataUrl('geo3d/scenes.json'), { cache: 'no-cache' }).then((res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status} for scenes.json`);
        // Under `vite dev` an absent file never reaches a 404: the SPA history
        // fallback answers 200 with index.html. Both spellings mean "no bake yet".
        if (!res.headers.get('content-type')?.includes('json')) return null;
        return res.json() as Promise<GroupRegistry>;
      }),
    );
    const groups = registry?.groups ?? [];
    yield* put(registryLoaded(groups));
    // Auto-select so the tool boots straight into a scene; the picker
    // dispatches the same action for every later switch.
    if (groups[0]) yield* put(groupSelected(groups[0].id));
  } catch (err) {
    yield* put(registryFailed((err as Error).message));
  }
}

export function* watchRegistrySaga() {
  yield* takeLatest([sagaContextRegistered, reloadRegistryRequested], loadRegistryWorker);
}
