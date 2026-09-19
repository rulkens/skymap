#!/usr/bin/env node
/**
 * fetchLocalBubble — download O'Neill+ 2024's Local Bubble shell-properties
 * table from Harvard Dataverse to data/raw/localbubble/.
 *
 * One 138 MB FITS BINTABLE, fetched by Dataverse file id rather than by name:
 * the dataset holds sixteen sibling tables (twelve posterior draws, two edge
 * thresholds, a mean) whose filenames differ by a suffix, and the id pins the
 * fiducial A_0.5' one unambiguously.
 *
 * See data/raw/localbubble/README.md for the in-repo provenance header.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { rawDataPath } from '../utils/io/rawDataRegistry';

/** Dataverse file id for ONeill2024_LocalBubble_ShellProperties_A0.5.fits (doi:10.7910/DVN/INB1RB). */
export const LOCAL_BUBBLE_SHELL_URL = 'https://dataverse.harvard.edu/api/access/datafile/8943783';

/** Exact upstream size — a short read means a truncated transfer, not a new release. */
const EXPECTED_BYTES = 138421440;

async function main(): Promise<void> {
  const outPath = rawDataPath('localbubble.shell');
  if (existsSync(outPath) && statSync(outPath).size === EXPECTED_BYTES) {
    console.log(`fetchLocalBubble: ${outPath} already complete — nothing to do`);
    return;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  console.log(`fetchLocalBubble: GET ${LOCAL_BUBBLE_SHELL_URL}`);
  const response = await fetch(LOCAL_BUBBLE_SHELL_URL);
  if (!response.ok) {
    throw new Error(`fetchLocalBubble: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== EXPECTED_BYTES) {
    throw new Error(
      `fetchLocalBubble: expected ${EXPECTED_BYTES} bytes, got ${bytes.length} — truncated transfer?`,
    );
  }
  writeFileSync(outPath, bytes);
  console.log(`fetchLocalBubble: wrote ${outPath} (${(bytes.length / 1e6).toFixed(1)} MB)`);
}

await main();
