#!/usr/bin/env node
/**
 * fetch2massXsc — pull `sup_phi` (PA) + `sup_ba` (b/a) from the 2MASS XSC
 * (VizieR table II/246/out) for every 2MASS ID listed in the local 2MRS
 * catalogue, and write the result to `data/raw/2mass_xsc_pa.csv`.
 *
 * Why a separate script (not part of buildAllBins): the fetch hits a
 * remote service, takes minutes, and produces a stable artefact. Build
 * runs read the cache; only `npm run fetch-2mass-xsc` re-pulls.
 *
 * Vizier TAP endpoint:
 *   POST https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync
 *   form: REQUEST=doQuery&LANG=ADQL&FORMAT=csv&QUERY=...
 *
 * We chunk the IN(...) clause by ~500 IDs per request — TAP rejects
 * gigantic single-query strings. ~45 k 2MRS rows → ~90 chunks × ~3 s
 * each = ~5 minutes wall clock.
 *
 * Catalog VII/233/xsc is the 2MASS Extended Source Catalog (galaxies +
 * other resolved sources). Note: II/246/out is the *Point* Source Catalog
 * and contains no shape info — easy to confuse, hours to debug.
 *
 * Column choice: `Spa` (super-coadd PA, deg, can be negative) and `Sb/a`
 * (super-coadd minor/major axis ratio) come from a fit on the combined
 * J+H+K 20-mag isophote, the most robust shape estimator the XSC
 * publishes for galaxies fainter than the per-band fit floor. We rename
 * them on the way out to `sup_phi` / `sup_ba` to match the existing
 * downstream consumer in `tools/parsers/twoMrs.ts` (parseXscShapeCsv).
 */

import {
  createReadStream,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
} from 'node:fs';
import { readIdSet } from '../utils/io/readIdSet';
import { resolve, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const TAP_URL = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync';
const CHUNK_SIZE = 500;


async function fetchChunk(
  ids: string[],
): Promise<Map<string, { sup_phi: number; sup_ba: number }>> {
  // The XSC stores the 2MASS designation with a trailing space inside the
  // string ("12345678+1234567 "). 2MRS publishes it without the trailing
  // space.  We add it back when building the IN-list so the equality test
  // matches the Vizier-side string exactly; we strip it again on the way
  // back out so the cache key stays in 2MRS's canonical form.
  const inList = ids.map((s) => `'${s} '`).join(',');
  // `Sb/a` and `Spa` need quoted identifiers because of the slash and the
  // mixed case — most other columns work without quotes but these don't.
  const adql = `SELECT "2MASX", "Spa", "Sb/a" FROM "VII/233/xsc" WHERE "2MASX" IN (${inList})`;
  const body = new URLSearchParams({
    REQUEST: 'doQuery',
    LANG: 'ADQL',
    FORMAT: 'csv',
    QUERY: adql,
  });
  const res = await fetch(TAP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`TAP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  const out = new Map<string, { sup_phi: number; sup_ba: number }>();
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  // First line is header: 2MASX,Spa,Sb/a
  for (let i = 1; i < lines.length; i++) {
    const [id, sup_phi, sup_ba] = lines[i]!.split(',');
    if (!id) continue;
    const phi = parseFloat(sup_phi ?? '');
    const ba = parseFloat(sup_ba ?? '');
    if (Number.isFinite(phi) && Number.isFinite(ba)) {
      // Strip surrounding quotes, then trim the trailing pad-space the
      // XSC stores inside the literal.
      const cleanId = id.replace(/^"|"$/g, '').trim();
      out.set(cleanId, { sup_phi: phi, sup_ba: ba });
    }
  }
  return out;
}

async function readTwoMrsIds(path: string): Promise<string[]> {
  const ids: string[] = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    // Bytes 1-16 in the 2MRS fixed-width file are the 2MASS designation.
    const id = line.slice(0, 16).trim();
    if (id.length > 0) ids.push(id);
  }
  return ids;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inputArg = argv.find((a) => !a.startsWith('--')) ?? 'data/raw/2mrs_table3.dat';
  const outPath = resolve('data/raw/2mass_xsc_pa.csv');

  process.stderr.write(`reading 2MRS IDs from ${inputArg}…\n`);
  const allIds = await readTwoMrsIds(resolve(inputArg));
  process.stderr.write(`  ${allIds.length.toLocaleString()} IDs in 2MRS\n`);

  if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });

  // Resume support: any ID already in the cache file is skipped, even if its
  // sup_phi/sup_ba columns are empty (we asked, XSC said "no match"). On a
  // fresh run, the file doesn't exist and the set is empty.
  const done = readIdSet(outPath);
  if (done.size === 0) {
    // Fresh run — write header line. Subsequent runs append.
    writeFileSync(outPath, '2massID,sup_phi,sup_ba\n');
  } else {
    process.stderr.write(`  resume: ${done.size.toLocaleString()} IDs already cached, skipping\n`);
  }

  const todo = allIds.filter((id) => !done.has(id));
  process.stderr.write(`  fetching ${todo.length.toLocaleString()} remaining\n`);

  for (let i = 0; i < todo.length; i += CHUNK_SIZE) {
    const chunk = todo.slice(i, i + CHUNK_SIZE);
    process.stderr.write(`  chunk ${i / CHUNK_SIZE + 1}/${Math.ceil(todo.length / CHUNK_SIZE)}…\n`);
    const result = await fetchChunk(chunk);
    // Write one row per QUERIED id (matched or not) so resume sees them all.
    // Unmatched IDs become `id,,` — same row shape, empty numeric cells.
    const lines: string[] = [];
    for (const id of chunk) {
      const r = result.get(id);
      if (r) lines.push(`${id},${r.sup_phi},${r.sup_ba}`);
      else lines.push(`${id},,`);
    }
    appendFileSync(outPath, lines.join('\n') + '\n');
  }

  process.stderr.write(`done; total cached: ${(done.size + todo.length).toLocaleString()}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
