#!/usr/bin/env node
/**
 * fetchClusterCatalogs — download the MCXC X-ray cluster catalogue and the
 * MSCC supercluster catalogue from the CDS VizieR FTP archive to
 * data/raw/{mcxc,mscc}/.
 *
 * Both catalogs are plain uncompressed fixed-width ASCII (no .gz step
 * needed — unlike CF-4's table2.dat.gz), so the fetch is a straight
 * streaming write to disk with Range-resume support.
 *
 * After each .dat is written, the file is hashed and the result is
 * compared against the committed .sha256 sidecar.  A mismatch means the
 * download is corrupt or the upstream file changed; the script exits 1
 * with a clear message rather than silently letting a future parser mis-
 * interpret truncated rows.
 *
 * Source layout:
 *   data/raw/mcxc/mcxc.dat  — 1743 rows × 323 bytes (J/A+A/534/A109)
 *   data/raw/mcxc/ReadMe    — VizieR column-offset spec (gitignored)
 *   data/raw/mscc/mscc.dat  — 601 rows × 324 bytes (J/MNRAS/445/4073)
 *   data/raw/mscc/ReadMe    — VizieR column-offset spec (gitignored)
 *
 * See data/raw/mcxc/README.md and data/raw/mscc/README.md for provenance.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { downloadWithResume, sha256OfFile } from './fetchCosmicflows4.js';
import { rawDataPath } from '../utils/io/rawDataRegistry.js';

// ── CDS FTP URLs ────────────────────────────────────────────────────────────

export const MCXC_TABLE_URL =
  'https://cdsarc.cds.unistra.fr/ftp/J/A+A/534/A109/mcxc.dat';
export const MCXC_README_URL =
  'https://cdsarc.cds.unistra.fr/ftp/J/A+A/534/A109/ReadMe';

export const MSCC_TABLE_URL =
  'https://cdsarc.cds.unistra.fr/ftp/J/MNRAS/445/4073/mscc.dat';
export const MSCC_README_URL =
  'https://cdsarc.cds.unistra.fr/ftp/J/MNRAS/445/4073/ReadMe';

// ── Paths via registry (never hardcoded) ────────────────────────────────────

const MCXC_TABLE_PATH = rawDataPath('mcxc.table');
const MCXC_README_PATH = rawDataPath('mcxc.readme');
const MCXC_SHA256_PATH = rawDataPath('mcxc.sha256');

const MSCC_TABLE_PATH = rawDataPath('mscc.table');
const MSCC_README_PATH = rawDataPath('mscc.readme');
const MSCC_SHA256_PATH = rawDataPath('mscc.sha256');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Read the committed .sha256 sidecar and return the expected digest string.
 *
 * The sidecar format is `<hex>  <filename>\n` (two spaces, matching the
 * `shasum -a 256` output convention used throughout this project).
 */
function readExpectedDigest(sha256Path: string): string {
  const line = readFileSync(sha256Path, 'utf8').trim();
  // First token before whitespace is the hex digest
  const digest = line.split(/\s+/)[0];
  if (!digest || digest.length !== 64) {
    throw new Error(`Malformed .sha256 sidecar at ${sha256Path}: ${line}`);
  }
  return digest;
}

/**
 * Download one catalog file + its ReadMe, then verify the table against the
 * committed .sha256 sidecar.
 *
 * Exits the process with code 1 if the digest doesn't match, to give a clear
 * signal before a downstream parser silently reads corrupt rows.
 */
async function fetchCatalog(opts: {
  label: string;
  tableUrl: string;
  readmeUrl: string;
  tablePath: string;
  readmePath: string;
  sha256Path: string;
}): Promise<void> {
  const { label, tableUrl, readmeUrl, tablePath, readmePath, sha256Path } = opts;

  process.stderr.write(`\nfetchClusterCatalogs: ${label}\n`);

  // ReadMe first — tiny (~5 KB) and the parser needs it; fast failure beats a
  // silent missing-column-spec issue discovered only when building bins.
  const readmeResult = await downloadWithResume(readmeUrl, readmePath);
  process.stderr.write(
    `  ReadMe: ${readmeResult.totalBytes.toLocaleString()} bytes` +
      (readmeResult.bytesAdded > 0
        ? ` (+${readmeResult.bytesAdded.toLocaleString()})\n`
        : ' (already complete)\n'),
  );

  process.stderr.write(`  target: ${tablePath}\n`);
  const tableResult = await downloadWithResume(tableUrl, tablePath);
  process.stderr.write(
    `  ${label}.dat: ${tableResult.totalBytes.toLocaleString()} bytes` +
      (tableResult.bytesAdded > 0
        ? ` (+${tableResult.bytesAdded.toLocaleString()})\n`
        : ' (already complete)\n'),
  );

  // Verify against the committed sidecar — fail loud so a fresh-clone user
  // knows immediately if the upstream file changed or the download was cut.
  const actualDigest = await sha256OfFile(tablePath);
  const expectedDigest = readExpectedDigest(sha256Path);

  if (actualDigest !== expectedDigest) {
    process.stderr.write(
      `  ERROR: sha256 mismatch for ${label}.dat\n` +
        `    expected: ${expectedDigest}\n` +
        `    actual:   ${actualDigest}\n` +
        `  The upstream file may have changed, or the download was truncated.\n` +
        `  Delete ${tablePath} and re-run to force a fresh download.\n`,
    );
    process.exit(1);
  }

  process.stderr.write(`  sha256 OK: ${actualDigest}\n`);
}

async function main(): Promise<void> {
  await fetchCatalog({
    label: 'mcxc',
    tableUrl: MCXC_TABLE_URL,
    readmeUrl: MCXC_README_URL,
    tablePath: MCXC_TABLE_PATH,
    readmePath: MCXC_README_PATH,
    sha256Path: MCXC_SHA256_PATH,
  });

  await fetchCatalog({
    label: 'mscc',
    tableUrl: MSCC_TABLE_URL,
    readmeUrl: MSCC_README_URL,
    tablePath: MSCC_TABLE_PATH,
    readmePath: MSCC_README_PATH,
    sha256Path: MSCC_SHA256_PATH,
  });

  process.stderr.write('\nfetchClusterCatalogs: done\n');
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
