#!/usr/bin/env node
/**
 * fetchOhm1690 — download the OpenHistoricalMap relations the antique Earth
 * map's 1690 borders cut along (`OHM_RELATIONS_1690`) and their member ways,
 * as they stood at OHM_SNAPSHOT_1690 (an Overpass attic query), into
 * data/raw/ohm/. OHM data is CC0; any element tagged with another licence,
 * a relation not alive on 1690-07-01 or one whose version moved off its pin
 * is refused. Only the elements are kept, key-sorted, so the bytes (and the
 * committed checksum) do not change with Overpass's response header.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

import type { OhmElement } from '../antique/earth/@types/OhmElement';
import { OHM_RELATIONS_1690, OHM_SNAPSHOT_1690 } from '../antique/earth/data/ohmRelations1690';
import { rawDataPath } from '../utils/io/rawDataRegistry';

const ENDPOINT = 'https://overpass-api.openhistoricalmap.org/api/interpreter';
const ALIVE_ON = '1690-07-01';
const CC0 = /^CC0/i;

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const sortKeys = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
        )
      : value;

async function main(): Promise<void> {
  const path = rawDataPath('ohm.relations-1690');
  const sidecarPath = rawDataPath('ohm.sha256');
  const expected = existsSync(sidecarPath) ? readFileSync(sidecarPath, 'utf8').split(/\s+/)[0] : undefined;
  if (existsSync(path) && sha256(readFileSync(path)) === expected) {
    console.log(`fetchOhm1690: ${basename(path)} matches its checksum, skipped`);
    return;
  }
  const ids = OHM_RELATIONS_1690.map((r) => r.id).join(',');
  const query = `[out:json][timeout:300][date:"${OHM_SNAPSHOT_1690}"];relation(id:${ids})->.r;.r out meta;way(r.r);out meta geom;`;
  console.log(`fetchOhm1690: POST ${ENDPOINT} (${OHM_RELATIONS_1690.length} relations at ${OHM_SNAPSHOT_1690})`);
  const response = await fetch(ENDPOINT, { method: 'POST', body: new URLSearchParams({ data: query }) });
  if (!response.ok) throw new Error(`fetchOhm1690: ${response.status} ${response.statusText}`);
  const { elements } = (await response.json()) as { elements: OhmElement[] };

  const problems: string[] = [];
  for (const element of elements) {
    for (const [key, value] of Object.entries(element.tags ?? {}))
      if (/^licen[cs]e$/.test(key) && !CC0.test(value))
        problems.push(`${element.type} ${element.id}: ${key}=${value} is not CC0`);
  }
  for (const pin of OHM_RELATIONS_1690) {
    const relation = elements.find((e) => e.type === 'relation' && e.id === pin.id);
    if (!relation) {
      problems.push(`relation ${pin.id} (${pin.name}) missing`);
      continue;
    }
    if (relation.version !== pin.version)
      problems.push(`relation ${pin.id} (${pin.name}) is version ${relation.version}, pinned ${pin.version}`);
    const start = relation.tags?.start_date ?? '0000';
    const end = relation.tags?.end_date ?? '9999';
    if (!(start.slice(0, 10) <= ALIVE_ON && end.slice(0, 10) > ALIVE_ON))
      problems.push(`relation ${pin.id} (${pin.name}) runs ${start}–${end}, not alive on ${ALIVE_ON}`);
  }
  if (problems.length > 0) throw new Error(`fetchOhm1690: refused\n  ${problems.join('\n  ')}`);

  const ordered = [...elements].sort((a, b) => a.type.localeCompare(b.type) || a.id - b.id);
  const bytes = Buffer.from(JSON.stringify(sortKeys({ snapshot: OHM_SNAPSHOT_1690, elements: ordered })));
  const digest = sha256(bytes);
  // Attic data at a fixed snapshot does not change, so a different digest means the extract itself changed.
  if (expected && expected !== digest) {
    throw new Error(`fetchOhm1690: sha256 ${digest}, expected ${expected}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  writeFileSync(sidecarPath, `${digest}  ${basename(path)}\n`);
  console.log(`fetchOhm1690: wrote ${path} (${elements.length} elements, ${(bytes.length / 1e6).toFixed(1)} MB)`);
}

await main();
