#!/usr/bin/env node
/**
 * fetchSkraafoto — harvest one scene group's oblique frames from
 * Dataforsyningen's skråfoto STAC search (`--group <id>`, default
 * `soendermarken`): the item JSON verbatim plus one JPEG per photo, cut from
 * the COG's own overview pyramid (`data/raw/skraafoto/README.md` — endpoint,
 * credential, licence, and the two window recipes).
 *
 * The token is a *different* credential from `fetchDhm.ts`'s Datafordeler
 * apiKey, and travels only as a request header / `GDAL_HTTP_HEADERS` — never
 * in a URL or in the argv `gdal_translate` exposes to `ps`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SceneGroupDefinition } from '../scene-recon/@types/SceneGroupDefinition';
import type { SkraafotoStacItem } from '../scene-recon/@types/SkraafotoStacItem';
import { sceneGroupFromArgv } from '../scene-recon/groups/sceneGroupFromArgv';
import {
  frameWindow,
  frameWindowOutputPx,
  type FrameWindow,
} from '../scene-recon/poses/frameWindow';
import { spawnCct } from '../scene-recon/poses/spawnCct';
import { topocentricPositionsM } from '../scene-recon/poses/topocentricPositionsM';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { skraafotoHarvestDir } from '../utils/skraafoto/skraafotoHarvestDir';
import { readKeychainSecret } from '../utils/io/readKeychainSecret';
import { redactSecret } from '../utils/io/redactSecret';
import type { Vec3 } from '../../src/@types/math/Vec3';

const SEARCH_ENDPOINT = 'https://api.dataforsyningen.dk/rest/skraafoto_api/v1.0/search';
const KEYCHAIN_SERVICE = 'skymap-dataforsyningen-apikey';
const SEARCH_LIMIT = 1000;

type ItemOutcome =
  | { readonly id: string; readonly status: 'existing' | 'fetched' | 'skipped' }
  | { readonly id: string; readonly status: 'failed'; readonly reason: string };

async function searchItems(
  group: SceneGroupDefinition,
  apiKey: string,
): Promise<readonly SkraafotoStacItem[]> {
  const { west, south, east, north } = group.bounds;
  const res = await fetch(SEARCH_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', token: apiKey },
    body: JSON.stringify({
      collections: [group.skraafoto.collection],
      bbox: [west, south, east, north],
      limit: SEARCH_LIMIT,
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${SEARCH_ENDPOINT}`);
  }
  const body = (await res.json()) as { readonly features?: readonly SkraafotoStacItem[] };
  return body.features ?? [];
}

function fetchItem(
  item: SkraafotoStacItem,
  window: FrameWindow,
  destDir: string,
  apiKey: string,
): ItemOutcome {
  const jsonPath = join(destDir, `${item.id}.json`);
  const jpgPath = join(destDir, `${item.id}.jpg`);
  if (existsSync(jsonPath) && existsSync(jpgPath)) return { id: item.id, status: 'existing' };

  const [outW, outH] = frameWindowOutputPx(window);
  const tmpPath = `${jpgPath}.tmp`;
  const run = spawnSync(
    'gdal_translate',
    [
      `/vsicurl/${item.assets.data.href}`,
      // The nadir COGs carry a fourth band; taking three writes a plain RGB
      // JPEG, where all four make libjpeg tag the file CMYK and every reader
      // downstream either refuses it or mis-converts it (spec §6.2).
      '-b',
      '1',
      '-b',
      '2',
      '-b',
      '3',
      // GDAL picks the overview level `-outsize` implies, so a cropped window
      // still reads the pyramid rather than the full-resolution raster.
      '-srcwin',
      String(window.x0),
      String(window.y0),
      String(window.widthPx),
      String(window.heightPx),
      '-outsize',
      String(outW),
      String(outH),
      '-of',
      'JPEG',
      tmpPath,
    ],
    {
      env: { ...process.env, GDAL_HTTP_HEADERS: `token: ${apiKey}`, GDAL_PAM_ENABLED: 'NO' },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );

  if (run.status !== 0) {
    rmSync(tmpPath, { force: true });
    const detail = run.error?.message ?? run.stderr.toString('utf8').trim();
    return {
      id: item.id,
      status: 'failed',
      reason: redactSecret(`gdal_translate failed (exit ${run.status}): ${detail}`, apiKey),
    };
  }

  // The JSON is written last, after the download it describes has landed — an
  // interrupt during gdal's multi-second fetch would otherwise strand a JSON
  // with no JPEG, and the bake enumerates this directory by `*.json`. The
  // reverse leftover (a JPEG with no JSON) is invisible to that enumeration and
  // is re-fetched by the both-present check above.
  renameSync(tmpPath, jpgPath);
  writeFileSync(jsonPath, `${JSON.stringify(item, null, 2)}\n`);
  return { id: item.id, status: 'fetched' };
}

let capturedApiKey: string | undefined;

async function main(): Promise<void> {
  const group = sceneGroupFromArgv(process.argv);
  const apiKey = readKeychainSecret(KEYCHAIN_SERVICE);
  capturedApiKey = apiKey;

  const destDir = skraafotoHarvestDir(rawDataPath('skraafoto.dir'), group);
  mkdirSync(destDir, { recursive: true });

  const items = await searchItems(group, apiKey);
  process.stderr.write(`fetchSkraafoto: ${items.length} item(s) for "${group.id}" → ${destDir}\n`);
  if (items.length === SEARCH_LIMIT) {
    process.stderr.write(
      `  warning: hit the ${SEARCH_LIMIT}-item search limit — harvest is short\n`,
    );
  }
  if (items.length === 0) {
    process.stderr.write('  no items matched — check the collection name and the group bbox\n');
    process.exitCode = 1;
    return;
  }

  // One `cct` for the whole batch; `bakeSplats` re-derives the same centres the
  // same way, so the windows it recomputes match the ones fetched here.
  const centresUtm: Vec3[] = items.map((item) => [...item.properties['pers:perspective_center']]);
  const positions = await topocentricPositionsM(group.anchor, centresUtm, { runCct: spawnCct });

  const outcomes: ItemOutcome[] = [];
  for (const [index, item] of items.entries()) {
    const progress = `[${index + 1}/${items.length}]`;
    try {
      const window = frameWindow(item, group, positions[index]!);
      const outcome =
        window === null
          ? ({ id: item.id, status: 'skipped' } as const)
          : fetchItem(item, window, destDir, apiKey);
      outcomes.push(outcome);
      process.stderr.write(
        outcome.status === 'failed'
          ? `${progress} ${item.id}: FAILED — ${outcome.reason}\n`
          : `${progress} ${item.id}: ${outcome.status}\n`,
      );
    } catch (err) {
      const reason = redactSecret((err as Error).message, apiKey);
      outcomes.push({ id: item.id, status: 'failed', reason });
      process.stderr.write(`${progress} ${item.id}: FAILED — ${reason}\n`);
    }
  }

  const failed = outcomes.filter((o) => o.status === 'failed');
  const skipped = outcomes.filter((o) => o.status === 'skipped');
  process.stderr.write(
    `done: ${outcomes.length - failed.length - skipped.length}/${outcomes.length} item(s) OK, ` +
      `${skipped.length} skipped (bounds off-frame or under 64 px)\n`,
  );
  if (failed.length > 0) {
    process.stderr.write(`${failed.length} item(s) failed — re-run to retry.\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    const raw = (err as Error).stack ?? (err as Error).message;
    process.stderr.write(`error: ${capturedApiKey ? redactSecret(raw, capturedApiKey) : raw}\n`);
    process.exit(1);
  });
}
