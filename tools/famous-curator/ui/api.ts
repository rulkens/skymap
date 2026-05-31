/**
 * api — typed fetch wrappers for the curator's /api/* routes.
 *
 * Built via a factory (`makeApi`) so component tests can inject a
 * stubbed `fetch`.  Production callers use `defaultApi`, which closes
 * over the real `window.fetch`.
 */
import type { RecipeDisk } from '../plugin/recipe';

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
  /** Disk axis ratio b/a from the seed (HyperLEDA logr25).  Absent when the
   *  seed has no photometric measurement for this galaxy. */
  axisRatio?: number;
  /** True when the galaxy's committed recipe carries a calibrated disk block.
   *  Lets the list flag which galaxies have had their disk geometry set. */
  hasDisk: boolean;
  /** Deproject flag of the committed disk; undefined when the galaxy has no
   *  disk.  Lets the list distinguish deprojected (face-on corrected) disks
   *  from flat ones. */
  diskDeproject?: boolean;
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
  /** Disk-overlay geometry — when present the preview applies the same deproject
   *  logic as the export route so the starless preview matches committed geometry. */
  disk?: RecipeDisk;
  /** Catalog-derived b/a fallback; mirrors the export route's field. */
  catalogAxisRatio?: number;
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

/**
 * ResolvedMedia — structural shape returned by /api/resolve.
 *
 * Deliberately re-declared here rather than imported from
 * `../plugin/noirlabResolver`: the UI bundle stays independent of
 * plugin internals (matching `FetchResult`, `ProcessResult`, etc.).
 * The route contract enforces the shape on the wire — these two
 * declarations are the contract on each side of it.
 */
export type ResolvedMedia = {
  directUrl: string;
  author: string;
  license: string;
  sourceUrl: string;
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
  /**
   * Resolve a paste-a-page URL → ResolvedMedia via /api/resolve.
   * Returns null on 404 (unknown host) so the App-level fallthrough is
   * a simple null check; throws on 422 / 5xx so the user sees the
   * error.  The 404-as-null branch is the only divergence from the
   * standard POST helper.
   */
  resolveMedia: (url: string) => Promise<ResolvedMedia | null>;
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
      const body = (await res.json()) as { error?: string };
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
      return readOrThrow(
        await f('/api/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        }),
      );
    },
    async resolveMedia(url) {
      const res = await f('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.status === 404) return null;
      return readOrThrow<ResolvedMedia>(res);
    },
    async postFetchBytes(bytes, mediaType) {
      return readOrThrow(
        await f('/api/fetch', {
          method: 'POST',
          headers: { 'Content-Type': mediaType },
          body: bytes,
        }),
      );
    },
    async postProcess(params) {
      return readOrThrow(
        await f('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        }),
      );
    },
    async postAlphaOnly(params) {
      return readOrThrow(
        await f('/api/process/alpha-only', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        }),
      );
    },
    async postExport(params) {
      return readOrThrow(
        await f('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        }),
      );
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
