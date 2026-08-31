/**
 * promoteWorkbenchExport.ts — promote an MCPM-workbench-exported cube to the
 * durable `mcpm-workbench` volume source. CLI: `--stem <name>` names the
 * `<name>.npy`+`<name>.json` pair under `data/raw/mcpm-workbench/`
 * (registry key `mcpm-workbench.dir`).
 *
 * Steps: validate the sidecar's provenance (must stamp THIS exporter —
 * `emitTraceSidecar.ts`'s `provenance.producer: 'mcpm-workbench'` — so a
 * stray polyphorm-2mrs or hand-edited export can't silently overwrite the
 * vetted cube); import via the shared `buildRhizomeVolume()` (no duplicated
 * .npy→.scfd logic) to `public/data/scalar-field/v<N>/mcpm-workbench.scfd`;
 * copy the sidecar to the committed pointer
 * `data/seeds/mcpm_workbench_promoted.json` (mirrors the `famous.curated`
 * precedent) so git history records which run/params produced the live
 * cube; rebuild the data manifest; print a sync-r2 reminder.
 *
 * docs/DATA.md's "MCPM workbench promotion" section is the operator runbook.
 */

import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildRhizomeVolume } from './buildRhizomeVolume';
import { parsePolyphyTraceSidecar } from '../parsers/polyphyTraceSidecar';
import { buildDataManifest } from '../deploy/buildDataManifest';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { SCALAR_FIELD_DATA_PREFIX } from '../../src/data/volume/scalarFieldFormat';

const REQUIRED_PRODUCER = 'mcpm-workbench';

/**
 * Refuses a sidecar whose provenance doesn't stamp this exact importer as
 * producer. Delegates schema validation (rules 2-5) to
 * `parsePolyphyTraceSidecar` — a bad `dims`/`frame`/missing `format` throws
 * from there before this check even runs.
 */
export function assertWorkbenchProvenance(sidecarText: string): void {
  const sidecar = parsePolyphyTraceSidecar(sidecarText);
  const producer = sidecar.provenance?.producer;
  if (producer !== REQUIRED_PRODUCER) {
    throw new Error(
      `promoteWorkbenchExport: sidecar provenance.producer is ${JSON.stringify(producer)}, ` +
        `expected ${JSON.stringify(REQUIRED_PRODUCER)} — this CLI only promotes MCPM-workbench dev-tool exports`,
    );
  }
}

async function promoteWorkbenchExport(stem: string): Promise<void> {
  const dir = rawDataPath('mcpm-workbench.dir');
  const npyPath = join(dir, `${stem}.npy`);
  const sidecarPath = join(dir, `${stem}.json`);
  if (!existsSync(npyPath) || !existsSync(sidecarPath)) {
    throw new Error(
      `promoteWorkbenchExport: expected ${stem}.npy + ${stem}.json under ${dir} — drop the ` +
        'browser-downloaded pair there first',
    );
  }

  const sidecarText = readFileSync(sidecarPath, 'utf8');
  assertWorkbenchProvenance(sidecarText);

  const outPath = resolve(`public/data/${SCALAR_FIELD_DATA_PREFIX}/mcpm-workbench.scfd`);
  await buildRhizomeVolume({ npyPath, outPath });

  const pointerPath = rawDataPath('mcpm-workbench.promoted');
  copyFileSync(sidecarPath, pointerPath);
  console.log(`[promoteWorkbenchExport] copied sidecar to ${pointerPath}`);

  buildDataManifest(resolve('public/data'));

  console.log(
    '[promoteWorkbenchExport] done — run `npm run sync-r2-secure` from the main worktree to publish.',
  );
}

function printUsage(): void {
  console.error('usage: tsx tools/volumes/promoteWorkbenchExport.ts --stem <name>');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const stemIndex = args.indexOf('--stem');
  const stem = stemIndex !== -1 ? args[stemIndex + 1] : undefined;
  if (!stem) {
    printUsage();
    process.exit(1);
  }
  await promoteWorkbenchExport(stem);
}

const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
