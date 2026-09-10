#!/usr/bin/env node
/**
 * fetchSkraafoto — harvest the Søndermarken oblique frames from
 * Dataforsyningen's skråfoto STAC search into
 * `data/raw/skraafoto/<collection>/`: the item JSON verbatim plus one
 * 1920-long-edge JPEG per photo, cut from the COG's own overview pyramid
 * (`data/raw/skraafoto/README.md` — endpoint, credential, licence).
 *
 * The token is a *different* credential from `fetchDhm.ts`'s Datafordeler
 * apiKey, and travels only as a request header / `GDAL_HTTP_HEADERS` — never
 * in a URL or in the argv `gdal_translate` exposes to `ps`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SkraafotoStacItem } from '../scene-recon/@types/SkraafotoStacItem';
import { SOENDERMARKEN } from '../scene-recon/groups/soendermarken';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { readKeychainSecret } from '../utils/io/readKeychainSecret';
import { redactSecret } from '../utils/io/redactSecret';

const SEARCH_ENDPOINT = 'https://api.dataforsyningen.dk/rest/skraafoto_api/v1.0/search';
const KEYCHAIN_SERVICE = 'skymap-dataforsyningen-apikey';
const SEARCH_LIMIT = 1000;
const LONG_EDGE_PX = 1920;

type ItemOutcome =
  | { readonly id: string; readonly status: 'existing' | 'fetched' }
  | { readonly id: string; readonly status: 'failed'; readonly reason: string };

async function searchItems(apiKey: string): Promise<readonly SkraafotoStacItem[]> {
  const { west, south, east, north } = SOENDERMARKEN.bounds;
  const res = await fetch(SEARCH_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', token: apiKey },
    body: JSON.stringify({
      collections: [SOENDERMARKEN.skraafoto.collection],
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

/** `[width, height]` in the order `-outsize` wants — see the type's `proj:shape` note. */
function downsampledSize(item: SkraafotoStacItem): readonly [number, number] {
  const [heightPx, widthPx] = item.properties['proj:shape'];
  const scale = LONG_EDGE_PX / Math.max(widthPx, heightPx);
  return [Math.round(widthPx * scale), Math.round(heightPx * scale)];
}

function fetchItem(item: SkraafotoStacItem, destDir: string, apiKey: string): ItemOutcome {
  const jsonPath = join(destDir, `${item.id}.json`);
  const jpgPath = join(destDir, `${item.id}.jpg`);
  // A failed gdal_translate never leaves a renamed file behind, so presence of
  // both is a trustworthy resume marker — no header check as fetchDhm needs.
  if (existsSync(jsonPath) && existsSync(jpgPath)) return { id: item.id, status: 'existing' };

  writeFileSync(jsonPath, `${JSON.stringify(item, null, 2)}\n`);

  const [outW, outH] = downsampledSize(item);
  const tmpPath = `${jpgPath}.tmp`;
  const run = spawnSync(
    'gdal_translate',
    [
      `/vsicurl/${item.assets.data.href}`,
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

  renameSync(tmpPath, jpgPath);
  return { id: item.id, status: 'fetched' };
}

let capturedApiKey: string | undefined;

async function main(): Promise<void> {
  const apiKey = readKeychainSecret(KEYCHAIN_SERVICE);
  capturedApiKey = apiKey;

  const collection = SOENDERMARKEN.skraafoto.collection;
  const destDir = join(rawDataPath('skraafoto.dir'), collection);
  mkdirSync(destDir, { recursive: true });

  const items = await searchItems(apiKey);
  process.stderr.write(`fetchSkraafoto: ${items.length} item(s) in ${collection} → ${destDir}\n`);
  if (items.length === SEARCH_LIMIT) {
    process.stderr.write(
      `  warning: hit the ${SEARCH_LIMIT}-item search limit — harvest is short\n`,
    );
  }

  const outcomes: ItemOutcome[] = [];
  for (const [index, item] of items.entries()) {
    const progress = `[${index + 1}/${items.length}]`;
    try {
      const outcome = fetchItem(item, destDir, apiKey);
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
  process.stderr.write(`done: ${outcomes.length - failed.length}/${outcomes.length} item(s) OK\n`);
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
