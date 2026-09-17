/**
 * Albedo bench API plugin — full route table.
 *
 * Routes (all under /api/):
 *
 *   POST /api/render   — one PNG, `original` or `adjusted` (+ optional relight)
 *   POST /api/field     — the fitted sun field as arrows, for the overlay
 *   GET  /api/recipe    — the committed recipe
 *   POST /api/recipe    — validate + save the recipe
 *
 * Sources (Viking imagery, MOLA height) and the Mars datum radius are built
 * once at plugin boot and closed over by every route — the routes
 * themselves take injected deps (see routes/render.ts, routes/field.ts) so
 * their own tests can pass the T4 fakes instead.
 *
 * The field cache lives here, not in a route file: both /api/render and
 * /api/field share one `getField`, an LRU of the last 8 `fitSunField`
 * results keyed by `(box, sunFit)` — a grade-slider tweak never refits.
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import sharp from 'sharp';
import { resolve } from 'node:path';
import { readJsonBody } from '../../utils/http/readJsonBody.ts';
import { sendJson } from '../../utils/http/sendJson.ts';
import { statusForError } from '../../utils/http/statusForError.ts';
import type { ErrorStatusRule } from '../../utils/http/ErrorStatusRule.ts';
import type { AlbedoRecipe } from '../../textures/AlbedoRecipe.ts';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds.ts';
import type { SunField } from '../../textures/SunField.ts';
import { fitSunField } from '../../textures/fitSunField.ts';
import { geoTiffImagerySource } from '../../textures/geoTiffImagerySource.ts';
import { geoTiffHeightSource } from '../../textures/geoTiffHeightSource.ts';
import { VIKING_MDIM21_GRID, MOLA_DEM463 } from '../../textures/surfaceBodies/marsGlobalRasters.ts';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets.ts';
import { handleRender, type RenderBody } from './routes/render.ts';
import { handleField, type FieldBody } from './routes/field.ts';
import { handleGetRecipe, handleSetRecipe } from './routes/recipe.ts';

/** The pyramid level both Viking and MOLA currently resolve to as tile
 *  sources (data/raw READMEs); inert for the bench, which only ever calls
 *  `readBox`/`readGrid` at explicit boxes and the fixed `SLOPE_LEVEL`. */
const TILE_MAX_LEVEL = 7;

const MAX_FIELD_CACHE_ENTRIES = 8;

function marsRadiusM(): number {
  const mars = SCENE_PLANETS.find((p) => p.id === 'mars');
  if (mars === undefined) throw new Error('apiPlugin: no mars entry in SCENE_PLANETS');
  return mars.surface.datumRadiusM;
}

function createFieldCache(opts: {
  readonly imagery: ReturnType<typeof geoTiffImagerySource>;
  readonly height: ReturnType<typeof geoTiffHeightSource>;
  readonly radiusM: number;
}): (region: LonLatBounds, sunFit: AlbedoRecipe['sunFit']) => Promise<SunField> {
  // Plain Map, LRU by re-insertion order: a hit deletes+re-sets its entry so
  // the oldest key is always the one `keys().next()` yields once the cache
  // is over its cap.
  const cache = new Map<string, Promise<SunField>>();
  return async (region, sunFit) => {
    const key = JSON.stringify({ box: region, sunFit });
    const hit = cache.get(key);
    if (hit !== undefined) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const promise = fitSunField({
      imagery: opts.imagery,
      height: opts.height,
      region,
      sunFit,
      radiusM: opts.radiusM,
    });
    cache.set(key, promise);
    if (cache.size > MAX_FIELD_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return promise;
  };
}

// 400 for the box/coverage validation errors the textures layer throws
// (geoTiffImagerySource, albedoRecipeImagerySource); anything unmatched
// falls through to the catch block's 500 default.
const MESSAGE_STATUS_RULES: readonly ErrorStatusRule[] = [
  {
    test: (err) =>
      /outside field\.bounds|only partly overlaps|has no coverage/.test((err as Error).message),
    status: 400,
  },
];

function resolveRepoRoot(): string {
  // tools/albedo-bench/plugin/apiPlugin.ts -> 3 levels up -> repo root.
  return resolve(import.meta.dirname, '../../..');
}

export function apiPlugin(): Plugin {
  const repoRoot = resolveRepoRoot();
  const recipePath = resolve(repoRoot, 'tools/textures/surfaceBodies/marsAlbedoRecipe.json');

  const imagery = geoTiffImagerySource({
    id: 'viking-mdim21-232m',
    attribution:
      'Mars Viking Colorized Global Mosaic 232m v2, USGS Astrogeology Science Center (2014) — public domain (US government work).',
    provenance: {
      sourceId: 'viking-mdim21-232m',
      attribution: 'USGS Astrogeology, Mars Viking Colorized Global Mosaic 232m v2 (2014).',
      vintage: '2014',
    },
    grid: VIKING_MDIM21_GRID,
    maxLevel: TILE_MAX_LEVEL,
  });
  const height = geoTiffHeightSource({
    id: 'mola-dem463',
    attribution:
      'Mars MGS MOLA DEM 463m v2, USGS Astrogeology Science Center — Fergason, Hare & Laura (2018) — public domain (US government work).',
    provenance: {
      sourceId: 'mola-dem463',
      attribution: 'USGS Astrogeology, Mars MGS MOLA DEM 463m v2 (Fergason, Hare & Laura 2018).',
      vintage: '2018',
    },
    grid: MOLA_DEM463.grid,
    nodata: MOLA_DEM463.nodata,
    // Slopes are central differences of neighbouring posts, so a constant
    // areoid-to-datum rebase (the bake's +6,190 m) cancels out — the bench
    // never reads an absolute elevation, only differences of it.
    offsetM: 0,
    maxLevel: TILE_MAX_LEVEL,
  });
  const radiusM = marsRadiusM();
  const getField = createFieldCache({ imagery, height, radiusM });

  return {
    name: 'albedo-bench-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleRequest(req, res, next);
      });

      async function handleRequest(
        req: IncomingMessage,
        res: ServerResponse,
        next: () => void,
      ): Promise<void> {
        const url = req.url ?? '';
        const method = req.method ?? 'GET';
        if (!url.startsWith('/api/')) {
          next();
          return;
        }
        const path = url.split('?')[0] ?? url;
        try {
          if (method === 'POST' && path === '/api/render') {
            const body = (await readJsonBody(req)) as RenderBody;
            const rgba = await handleRender({ body, deps: { imagery, height, radiusM, getField } });
            const png = await sharp(Buffer.from(rgba), {
              raw: { width: body.px, height: body.px, channels: 4 },
            })
              .png()
              .toBuffer();
            res.statusCode = 200;
            res.setHeader('Content-Type', 'image/png');
            res.end(png);
            return;
          }

          if (method === 'POST' && path === '/api/field') {
            const body = (await readJsonBody(req)) as FieldBody;
            const out = await handleField({ body, deps: { getField } });
            sendJson(res, 200, out);
            return;
          }

          if (method === 'GET' && path === '/api/recipe') {
            sendJson(res, 200, handleGetRecipe({ recipePath }));
            return;
          }

          if (method === 'POST' && path === '/api/recipe') {
            const body = await readJsonBody(req);
            const result = handleSetRecipe({ body, recipePath });
            sendJson(
              res,
              result.status,
              result.status === 200 ? { recipe: result.recipe } : { error: result.error },
            );
            return;
          }

          sendJson(res, 404, { error: 'not found', path });
        } catch (err) {
          const status = statusForError(err, MESSAGE_STATUS_RULES) ?? 500;
          sendJson(res, status, { error: (err as Error).message });
        }
      }
    },
  };
}
