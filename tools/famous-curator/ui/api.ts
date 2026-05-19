/**
 * api — typed fetch wrappers for the curator's /api/* routes.
 *
 * Built via a factory (`makeApi`) so component tests can inject a
 * stubbed `fetch`.  Production callers use `defaultApi`, which closes
 * over the real `window.fetch`.
 */

export type GalaxyListEntry = {
  id: string;
  names: string[];
  ra: number;
  dec: number;
  distanceMpc: number;
  diameterKpc: number;
  type: string;
  description: string;
  curated: boolean;
};

export type FetchResult = {
  tmpId: string;
  width: number;
  height: number;
  previewUrl: string;
  mediaType: string;
};

export type ProcessParams = {
  tmpId: string;
  crop: { x: number; y: number; width: number; height: number; rotationDeg: number };
  starnet: { stride: number; upsample: boolean };
  alpha: { blackPoint: number; whitePoint: number; gamma: number };
};

export type ProcessResult = {
  starlessPreviewUrl: string;
  alphaPreviewUrl: string;
};

export type AlphaOnlyParams = {
  tmpId: string;
  alpha: { blackPoint: number; whitePoint: number; gamma: number };
};

export type AlphaOnlyResult = {
  alphaPreviewUrl: string;
};

export type ExportParams = ProcessParams & {
  id: string;
  metadata: { sourceUrl: string; license: string; author: string };
};

export type ExportResult = {
  paths: {
    source: string;
    starless: string;
    full: string;
    atlas: string;
    recipe: string;
  };
};

export type BuildFamousResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type Api = {
  getGalaxies: () => Promise<{ galaxies: GalaxyListEntry[] }>;
  /**
   * Fetch the recipe.json for an already-curated galaxy.  Used by the
   * "resumable" flow: when the user re-clicks a curated entry the UI calls
   * this, then re-fetches the source URL to reconstruct sliders + crop.
   */
  getRecipe: (id: string) => Promise<{ recipe: import('../plugin/recipe').Recipe }>;
  postFetchUrl: (url: string) => Promise<FetchResult>;
  postFetchBytes: (bytes: BodyInit, mediaType: string) => Promise<FetchResult>;
  postProcess: (params: ProcessParams) => Promise<ProcessResult>;
  postAlphaOnly: (params: AlphaOnlyParams) => Promise<AlphaOnlyResult>;
  postExport: (params: ExportParams) => Promise<ExportResult>;
  /**
   * Run `npm run build-famous` server-side so the main app picks up the
   * latest curated images.  Resolves with stdout/stderr + exit code;
   * rejects only on transport errors.  A failed build (non-zero exit)
   * still resolves so the UI can show the stderr to the user.
   */
  postBuildFamous: () => Promise<BuildFamousResult>;
};

async function readOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (typeof body.error === 'string') msg = body.error;
    } catch {
      // ignore — keep generic message
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export function makeApi(deps: { fetch: typeof fetch }): Api {
  const f = deps.fetch;
  return {
    async getGalaxies() {
      return readOrThrow(await f('/api/galaxies'));
    },
    async getRecipe(id) {
      return readOrThrow(await f(`/api/recipe/${id}`));
    },
    async postFetchUrl(url) {
      return readOrThrow(await f('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }));
    },
    async postFetchBytes(bytes, mediaType) {
      return readOrThrow(await f('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': mediaType },
        body: bytes,
      }));
    },
    async postProcess(params) {
      return readOrThrow(await f('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }));
    },
    async postAlphaOnly(params) {
      return readOrThrow(await f('/api/process/alpha-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }));
    },
    async postExport(params) {
      return readOrThrow(await f('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }));
    },
    async postBuildFamous() {
      // The /api/build-famous route returns 200 on success and 500 on
      // non-zero exit, but in BOTH cases the JSON body is the
      // BuildFamousResult.  readOrThrow would discard the body on 500
      // so we read manually and surface the full result to the caller.
      const res = await f('/api/build-famous', { method: 'POST' });
      const body = (await res.json()) as BuildFamousResult;
      return body;
    },
  };
}

export const defaultApi: Api = makeApi({ fetch: globalThis.fetch });
