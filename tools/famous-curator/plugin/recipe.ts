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

import type { Vec2 } from '../../../src/@types/math/Vec2';

/**
 * Disk-overlay geometry annotation, drawn by the curator UI to let the
 * maintainer mark a galaxy's disk extent and orientation before export.
 *
 * All coordinates are in SOURCE-image pixels so the annotation is
 * invariant to crop/scale operations applied downstream.  axisRatio is
 * optional — when absent the render layer falls back to the catalog
 * value (b/a from the galaxy record).  deproject controls whether the
 * pipeline applies a b/a -> face-on correction at render time; seeded
 * from b/a >= DEPROJECT_MIN_AXIS_RATIO so only round-ish galaxies are
 * deprojected by default, avoiding introducing a spurious axis on
 * highly-inclined disks.
 */
export type RecipeDisk = {
  /** Nucleus position in SOURCE-image pixels. */
  centerPx: Vec2;
  /** Disk radius in SOURCE pixels (major-axis edge drag length). */
  radiusPx: number;
  /** Major-axis position angle in the SOURCE image, degrees [0,180). */
  paDeg: number;
  /** Minor-axis handle b/a; falls back to catalog axisRatio when absent. */
  axisRatio?: number;
  /** Deproject toggle, seeded from b/a >= DEPROJECT_MIN_AXIS_RATIO. */
  deproject: boolean;
  /**
   * Fractional sky padding around the disk for the deproject crop seed.
   * Optional; absent ⇒ DEFAULT_DISK_MARGIN. Validated >= 0.
   */
  margin?: number;
};

export type RecipeCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Rotation in degrees (clockwise in y-down screen coords, matching CSS
   * `transform: rotate(...)`).  Optional in the JSON — absent means 0.
   */
  rotationDeg: number;
};

/**
 * Source-image dimensions (pixels) the crop + disk were authored against.
 *
 * Crop and disk coordinates are ABSOLUTE source pixels, but the source bytes
 * are not cached across sessions — on resume the curator re-fetches the same
 * URL, which can return a DIFFERENT resolution (e.g. Wikipedia serving a
 * smaller rendition).  Recording the authoring dimensions lets the resume flow
 * rescale by the EXACT ratio instead of the best-effort `fitCropToSource`
 * reframe.  Optional: recipes written before this field round-trip unchanged
 * and fall back to the heuristic.
 */
export type RecipeSource = { width: number; height: number };

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
  /**
   * Optional source dimensions the crop was authored against.  Absence is a
   * valid state (older recipes predate the field); when present it enables an
   * exact resume rescale.  Version is NOT bumped — the field is optional, and a
   * strict bump would reject every existing recipe.json on disk.
   */
  source?: RecipeSource;
  starnet: RecipeStarnet;
  alpha: RecipeAlpha;
  metadata: RecipeMetadata;
  /** ISO 8601 timestamp.  Filled in by the export route at write time. */
  processedAt: string;
  /**
   * Optional disk-overlay geometry annotation.  Absence is a valid state —
   * recipes without a disk block round-trip unchanged.  Version is NOT
   * bumped: the field is optional, and a strict bump would reject every
   * existing recipe.json on disk.
   */
  disk?: RecipeDisk;
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
 * Validate and coerce a raw unknown value as a RecipeDisk.  Throws a
 * descriptive error on any invalid shape or non-finite number.  Returns
 * a freshly-constructed RecipeDisk (no aliasing to the input object) so
 * callers can mutate the result freely.
 *
 * Called from parseRecipe (schema validation on load) and from the
 * /api/export route (validation of client-supplied body.disk).  Single
 * source of truth for disk field constraints.
 */
export function validateRecipeDisk(raw: unknown): RecipeDisk {
  const d = raw as Record<string, unknown>;
  if (
    !Array.isArray(d.centerPx) ||
    d.centerPx.length !== 2 ||
    typeof d.centerPx[0] !== 'number' ||
    !Number.isFinite(d.centerPx[0]) ||
    typeof d.centerPx[1] !== 'number' ||
    !Number.isFinite(d.centerPx[1])
  ) {
    throw new Error('recipe: disk.centerPx must be a finite-number tuple [x, y]');
  }
  if (typeof d.radiusPx !== 'number' || !Number.isFinite(d.radiusPx)) {
    throw new Error('recipe: disk.radiusPx must be a finite number');
  }
  if (typeof d.paDeg !== 'number' || !Number.isFinite(d.paDeg)) {
    throw new Error('recipe: disk.paDeg must be a finite number');
  }
  if (d.axisRatio !== undefined) {
    if (typeof d.axisRatio !== 'number' || !Number.isFinite(d.axisRatio)) {
      throw new Error('recipe: disk.axisRatio must be a finite number when set');
    }
  }
  if (d.margin !== undefined) {
    if (typeof d.margin !== 'number' || !Number.isFinite(d.margin) || d.margin < 0) {
      throw new Error('recipe: disk.margin must be a finite number >= 0 when set');
    }
  }
  if (typeof d.deproject !== 'boolean') {
    throw new Error('recipe: disk.deproject must be a boolean');
  }
  return {
    centerPx: [d.centerPx[0], d.centerPx[1]],
    radiusPx: d.radiusPx,
    paDeg: d.paDeg,
    ...(d.axisRatio !== undefined ? { axisRatio: d.axisRatio as number } : {}),
    ...(d.margin !== undefined ? { margin: d.margin as number } : {}),
    deproject: d.deproject,
  };
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
  // rotationDeg is optional in the JSON — validate when present, default to 0.
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
  // Optional source dimensions — validate both axes are finite + positive when
  // present.  A zero or negative dimension would make the resume rescale divide
  // by zero / flip the crop, so we reject it at the boundary.
  let parsedSource: RecipeSource | undefined;
  if (raw.source !== undefined) {
    const s = raw.source as Record<string, unknown>;
    for (const k of ['width', 'height'] as const) {
      if (typeof s[k] !== 'number' || !Number.isFinite(s[k]) || (s[k] as number) <= 0) {
        throw new Error(`recipe: source.${k} must be a finite number > 0`);
      }
    }
    parsedSource = { width: s.width as number, height: s.height as number };
  }
  // Optional — delegate to the shared validator which returns a fresh RecipeDisk.
  const parsedDisk = raw.disk !== undefined ? validateRecipeDisk(raw.disk) : undefined;
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
    ...(parsedSource !== undefined ? { source: parsedSource } : {}),
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
    ...(parsedDisk !== undefined ? { disk: parsedDisk } : {}),
  };
}
