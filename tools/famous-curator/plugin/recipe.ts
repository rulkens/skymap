/**
 * recipe.json — per-galaxy provenance record.
 *
 * Persisted at public/images/famous-curated/<id>/recipe.json by the
 * /api/export route.  Lets the maintainer reload an exported galaxy
 * back into the curator UI (sliders restored, crop box reconstructed)
 * and, longer-term, lets us re-run the pipeline if StarNet/alpha
 * algorithms change without re-curating from scratch.
 *
 * Versioned to give future shape migrations a clear handle: bump
 * `version` and add a migration in `parseRecipe` when the schema changes.
 */

export type RecipeCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Rotation in degrees (clockwise in y-down screen coords, matching CSS
   * `transform: rotate(...)`).  Added after v1 launched, parsed as
   * optional with default 0 so pre-rotation recipes round-trip unchanged.
   */
  rotationDeg: number;
};

export type RecipeStarnet = {
  stride: number;
  upsample: boolean;
};

export type RecipeAlpha = {
  blackPoint: number;
  whitePoint: number;
  gamma: number;
};

export type RecipeMetadata = {
  sourceUrl: string;
  license: string;
  author: string;
};

export type Recipe = {
  version: 1;
  id: string;
  crop: RecipeCrop;
  starnet: RecipeStarnet;
  alpha: RecipeAlpha;
  metadata: RecipeMetadata;
  /** ISO 8601 timestamp.  Filled in by the export route at write time. */
  processedAt: string;
};

const KNOWN_VERSION = 1;

/**
 * Serialise a recipe to a diff-friendly JSON string with stable 2-space
 * indentation + a trailing newline (matches the project's prettier
 * config for `.json` files).
 */
export function serialiseRecipe(r: Recipe): string {
  return JSON.stringify(r, null, 2) + '\n';
}

/**
 * Parse + validate a recipe JSON string.  Throws on malformed JSON,
 * missing required fields, unknown versions, or non-finite numbers in
 * numeric fields.  Returns a fresh `Recipe` value (no aliasing to the
 * input object) so callers can mutate freely.
 */
export function parseRecipe(json: string): Recipe {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (raw.version !== KNOWN_VERSION) {
    throw new Error(`recipe: unknown version ${String(raw.version)} (expected ${KNOWN_VERSION})`);
  }
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    throw new Error('recipe: id must be a non-empty string');
  }
  const crop = raw.crop as Record<string, unknown> | undefined;
  if (!crop) throw new Error('recipe: missing crop block');
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    if (typeof crop[k] !== 'number' || !Number.isFinite(crop[k])) {
      throw new Error(`recipe: crop.${k} must be a finite number`);
    }
  }
  // rotationDeg is optional — older recipes (pre-rotation) omit it.
  // Validate when present; default to 0 when absent.
  if (crop.rotationDeg !== undefined) {
    if (typeof crop.rotationDeg !== 'number' || !Number.isFinite(crop.rotationDeg)) {
      throw new Error('recipe: crop.rotationDeg must be a finite number when set');
    }
  }
  const starnet = raw.starnet as Record<string, unknown> | undefined;
  if (!starnet) throw new Error('recipe: missing starnet block');
  if (typeof starnet.stride !== 'number' || !Number.isFinite(starnet.stride)) {
    throw new Error('recipe: starnet.stride must be a finite number');
  }
  if (typeof starnet.upsample !== 'boolean') {
    throw new Error('recipe: starnet.upsample must be a boolean');
  }
  const alpha = raw.alpha as Record<string, unknown> | undefined;
  if (!alpha) throw new Error('recipe: missing alpha block');
  for (const k of ['blackPoint', 'whitePoint', 'gamma'] as const) {
    if (typeof alpha[k] !== 'number' || !Number.isFinite(alpha[k])) {
      throw new Error(`recipe: alpha.${k} must be a finite number`);
    }
  }
  const meta = raw.metadata as Record<string, unknown> | undefined;
  if (!meta) throw new Error('recipe: missing metadata block');
  for (const k of ['sourceUrl', 'license', 'author'] as const) {
    if (typeof meta[k] !== 'string' || (meta[k] as string).length === 0) {
      throw new Error(`recipe: metadata.${k} must be a non-empty string`);
    }
  }
  if (typeof raw.processedAt !== 'string' || raw.processedAt.length === 0) {
    throw new Error('recipe: processedAt must be a non-empty string');
  }
  return {
    version: KNOWN_VERSION,
    id: raw.id,
    crop: {
      x: crop.x as number,
      y: crop.y as number,
      width: crop.width as number,
      height: crop.height as number,
      rotationDeg: (crop.rotationDeg as number | undefined) ?? 0,
    },
    starnet: {
      stride: starnet.stride,
      upsample: starnet.upsample,
    },
    alpha: {
      blackPoint: alpha.blackPoint as number,
      whitePoint: alpha.whitePoint as number,
      gamma: alpha.gamma as number,
    },
    metadata: {
      sourceUrl: meta.sourceUrl as string,
      license: meta.license as string,
      author: meta.author as string,
    },
    processedAt: raw.processedAt,
  };
}
