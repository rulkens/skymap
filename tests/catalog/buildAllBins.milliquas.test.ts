/**
 * buildAllBins — Milliquas pipeline smoke test.
 *
 * Why a separate test file rather than extending the existing parser
 * test?  The parser test exercises `parseMilliquas` in isolation —
 * field extraction, skip rules, sidecar-array population.  This test
 * walks the *next* hop of the pipeline: parsed records → records-to-
 * cloud assembly → binary encode → binary decode, mirroring the
 * `runCli` flow without any filesystem writes.
 *
 * The goal is to catch any silent drift between the Milliquas-specific
 * pre-merge shape (no axisRatio, no positionAngleDeg, no diameterKpc,
 * NaN-able photometry slots) and what `recordsToCloud` +
 * `encodeGalaxyCatalog` expect.  A regression here would otherwise
 * only surface at `npm run build-tiers` time against the 194 MB
 * upstream file, which is slow + gitignored + not present on CI.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMilliquas } from '../../tools/parsers/milliquas';
import { recordsToCloud } from '../../tools/catalog/buildAllBins';
import {
  encodeGalaxyCatalog,
  decodeGalaxyCatalog,
} from '../../src/data/galaxyCatalogFormat';
import { DEFAULT_GALAXY_DIAMETER_KPC } from '../../src/utils/math/galaxyDiameterKpc';

describe('buildAllBins — Milliquas smoke', () => {
  // Resolved up front so each `it` block can lean on the same parse
  // result without re-reading the fixture (vitest reuses describe-scope
  // closures across `it` blocks within the file).
  const raw = readFileSync(
    resolve(__dirname, '../fixtures/milliquas/sample.txt'),
    'utf8',
  );

  it('records-to-cloud + encode/decode preserves Milliquas-specific shape', () => {
    const { records, names } = parseMilliquas(raw);
    expect(records.length).toBeGreaterThan(0);

    const cloud = recordsToCloud(records);

    // Sidecar invariant: the parser's parallel arrays match the cloud
    // record count one-for-one before any tier subsampling.  This is
    // the property `buildAllBins.ts` relies on when threading
    // names/classes through the kept-indices permutation.
    expect(cloud.count).toBe(records.length);
    expect(names.length).toBe(records.length);

    // Photometry: Rmag survives through the Bmag→magG / Rmag→magR
    // mapping defined in the parser.  We don't pin a value because
    // the row ordering depends on the fixture's accept set; we only
    // verify that the first row's magR slot is a finite number, which
    // would not be true if encode/decode mis-routed the field.
    expect(Number.isFinite(cloud.magR[0])).toBe(true);

    // Morphology: quasars carry no resolved disk, so the three
    // morphology slots must land on the format's "no measurement"
    // fallbacks.  `recordsToCloud` substitutes the hash-based
    // fallback orientation when the parser supplied null — for
    // Milliquas every row is null, so the values come from
    // `fallbackOrientation`.  We assert that axisRatio is finite and
    // bounded (its [0,1] range is the renderer's invariant), and that
    // diameterKpc lands on the 30 kpc fallback the records-to-cloud
    // helper applies.
    expect(Number.isFinite(cloud.axisRatio[0])).toBe(true);
    expect(cloud.axisRatio[0]!).toBeGreaterThanOrEqual(0);
    expect(cloud.axisRatio[0]!).toBeLessThanOrEqual(1);
    expect(Number.isFinite(cloud.positionAngleDeg[0])).toBe(true);
    expect(cloud.diameterKpc[0]).toBe(DEFAULT_GALAXY_DIAMETER_KPC);

    // Round-trip through the binary format: every slot survives the
    // encode/decode pair byte-identically (Float32 precision aside).
    const decoded = decodeGalaxyCatalog(encodeGalaxyCatalog(cloud));
    expect(decoded.count).toBe(cloud.count);
    expect(decoded.magR[0]).toBeCloseTo(cloud.magR[0]!, 5);
    expect(decoded.axisRatio[0]).toBeCloseTo(cloud.axisRatio[0]!, 5);
    expect(decoded.positionAngleDeg[0]).toBeCloseTo(
      cloud.positionAngleDeg[0]!,
      5,
    );
    expect(decoded.diameterKpc[0]).toBe(DEFAULT_GALAXY_DIAMETER_KPC);
  });
});
