/** api — typed fetch wrappers for the bench's /api/* routes. */
import type { AlbedoRecipe } from '../../textures/@types/AlbedoRecipe';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import type { RenderBody } from '../@types/RenderBody';
import type { FieldArrow } from '../@types/FieldArrow';

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

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const api = {
  async getRecipe(): Promise<AlbedoRecipe> {
    return readJsonOrThrow(await fetch('/api/recipe'));
  },
  async saveRecipe(recipe: AlbedoRecipe): Promise<AlbedoRecipe> {
    const out = await readJsonOrThrow<{ recipe: AlbedoRecipe }>(
      await postJson('/api/recipe', recipe),
    );
    return out.recipe;
  },
  async renderPng(params: RenderBody): Promise<Blob> {
    const res = await postJson('/api/render', params);
    if (!res.ok) throw new Error(await messageOf(res));
    return await res.blob();
  },
  async getField(
    box: LonLatBounds,
    sunFit: AlbedoRecipe['sunFit'],
  ): Promise<{ arrows: FieldArrow[]; coarsened: boolean }> {
    return readJsonOrThrow(await postJson('/api/field', { box, sunFit }));
  },
};
