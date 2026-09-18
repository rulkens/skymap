/**
 * api — typed fetch wrappers for the bench's /api/* routes. Built via a
 * factory (`makeApi`) so a component test could inject a stubbed `fetch`;
 * production callers use `defaultApi`, closing over the real `window.fetch`.
 */
import type { AlbedoRecipe } from '../../textures/AlbedoRecipe';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import type { RenderBody, RenderLight } from '../plugin/routes/render';
import type { FieldArrow } from '../plugin/routes/field';

export type { RenderLight, FieldArrow };
export type RenderParams = RenderBody;

export type Api = {
  getRecipe: () => Promise<AlbedoRecipe>;
  saveRecipe: (recipe: AlbedoRecipe) => Promise<AlbedoRecipe>;
  renderPng: (params: RenderParams) => Promise<Blob>;
  getField: (
    box: LonLatBounds,
    sunFit: AlbedoRecipe['sunFit'],
  ) => Promise<{ arrows: FieldArrow[]; coarsened: boolean }>;
};

async function messageOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === 'string') return body.error;
  } catch {
    /* ignore — keep the generic message below */
  }
  return `HTTP ${res.status}`;
}

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await messageOf(res));
  return (await res.json()) as T;
}

export function makeApi(deps: { fetch: typeof fetch }): Api {
  const f = deps.fetch;
  return {
    async getRecipe() {
      return readJsonOrThrow(await f('/api/recipe'));
    },
    async saveRecipe(recipe) {
      const res = await f('/api/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe),
      });
      const out = await readJsonOrThrow<{ recipe: AlbedoRecipe }>(res);
      return out.recipe;
    },
    async renderPng(params) {
      const res = await f('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(await messageOf(res));
      return await res.blob();
    },
    async getField(box, sunFit) {
      return readJsonOrThrow(
        await f('/api/field', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ box, sunFit }),
        }),
      );
    },
  };
}

export const defaultApi: Api = makeApi({ fetch: globalThis.fetch });
