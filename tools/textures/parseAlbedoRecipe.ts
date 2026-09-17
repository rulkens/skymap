/**
 * parseAlbedoRecipe — the one gate a recipe JSON passes through, in the
 * bench's Save and the bake's read alike, so a malformed file fails loudly
 * right there instead of propagating a stray NaN into a baked pixel.
 */
import type { AlbedoRecipe } from './AlbedoRecipe';

type Schema = 'number' | 'tuple3' | { readonly [key: string]: Schema };

const RECIPE_SCHEMA: Schema = {
  version: 'number',
  sunFit: {
    windowKm: 'number',
    strideKm: 'number',
    highPassKm: 'number',
    minConfidence: 'number',
    fillSigmaKm: 'number',
  },
  deshade: { strength: 'number', minShading: 'number' },
  knee: { threshold: 'number', softness: 'number' },
  ice: {
    minAbsLatDeg: 'number',
    fadeDeg: 'number',
    minWhiteness: 'number',
    minLuminance: 'number',
  },
  grade: {
    exposureEv: 'number',
    gain: 'tuple3',
    offset: 'tuple3',
    contrast: 'number',
    saturation: 'number',
    gamma: 'number',
  },
};

function validate(value: unknown, schema: Schema, path: string): void {
  if (schema === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(
        `parseAlbedoRecipe: ${path} must be a finite number, got ${JSON.stringify(value)}`,
      );
    }
    return;
  }
  if (schema === 'tuple3') {
    if (!Array.isArray(value) || value.length !== 3) {
      throw new Error(`parseAlbedoRecipe: ${path} must be a 3-tuple, got ${JSON.stringify(value)}`);
    }
    value.forEach((entry, index) => validate(entry, 'number', `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`parseAlbedoRecipe: ${path} must be an object, got ${JSON.stringify(value)}`);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(schema)) {
    if (!(key in record)) throw new Error(`parseAlbedoRecipe: missing key ${path}.${key}`);
    validate(record[key], schema[key]!, `${path}.${key}`);
  }
  for (const key of Object.keys(record)) {
    if (!(key in schema)) throw new Error(`parseAlbedoRecipe: unexpected key ${path}.${key}`);
  }
}

export function parseAlbedoRecipe(json: string): AlbedoRecipe {
  const parsed: unknown = JSON.parse(json);
  validate(parsed, RECIPE_SCHEMA, '$');
  const recipe = parsed as AlbedoRecipe;
  // version's value, not just its type, is a contract: a future format bump
  // must not silently misread as v1.
  if (recipe.version !== 1) {
    throw new Error(
      `parseAlbedoRecipe: $.version must be 1, got ${JSON.stringify(recipe.version)}`,
    );
  }
  return recipe;
}
