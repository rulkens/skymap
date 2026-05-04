/**
 * parseNDskl — pure parser for DisPerSE's `.NDskl` ASCII skeleton format.
 *
 * What is .NDskl?
 *
 * DisPerSE (Sousbie 2011) outputs the persistent skeleton of a density
 * field as a graph of critical points (max / min / saddles) connected by
 * filament arcs.  The ASCII serialisation interleaves several blocks
 * delimited by bracketed headers; we ignore everything except [FILAMENTS]
 * (the polylines themselves) and [FILAMENTS DATA] (per-vertex density).
 *
 * Why a pure parser separated from the IO?
 *
 * Pure-function parsers are trivially unit-testable from a string fixture
 * — no temp files, no DisPerSE install needed in CI.  The CLI wrapper
 * (`tools/buildFilaments.ts`) does the file IO and shells out to the
 * native binary; this module just turns text into typed data.
 *
 * Why ignore [CRITICAL POINTS]?
 *
 * For visualisation we only need the polyline geometry of each filament.
 * The critical-point list is useful for analytical work (filament-length
 * statistics, persistence diagrams) but adds no visual signal — the
 * polylines already start and end at maxima or saddles.  Phase 2 might
 * surface them if we ever want to render cluster nodes as dots.
 */

/** A single filament polyline. */
export type FilamentStrip = {
  /** Sequence of (x, y, z) sample points in input-file units (Mpc for us). */
  vertices: Array<[number, number, number]>;
  /**
   * Per-vertex density values from the [FILAMENTS DATA] field_value column.
   * Same length as `vertices`; NaN-filled when [FILAMENTS DATA] is absent
   * or when DisPerSE was run without per-skeleton field tracking.
   */
  density: number[];
};

/** Parsed skeleton result. */
export type ParsedSkeleton = {
  strips: FilamentStrip[];
};

/**
 * Parse a `.NDskl` ASCII skeleton.  Throws on malformed input rather than
 * returning partial results — DisPerSE output is machine-generated, so
 * any malformedness is a real bug we want surfaced loudly.
 */
export function parseNDskl(text: string): ParsedSkeleton {
  // Normalise CRLF → LF so the line splitter doesn't double-count.  Some
  // operating systems write .NDskl with Windows line endings even when
  // the toolchain is Linux-native.
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  // ── Magic check ──────────────────────────────────────────────────────
  if (!lines[0]?.startsWith('ANDSKEL')) {
    throw new Error('parseNDskl: missing ANDSKEL magic on first line');
  }

  // ── Locate the [FILAMENTS] block ─────────────────────────────────────
  const filamentsHdr = lines.findIndex((l) => l.trim() === '[FILAMENTS]');
  if (filamentsHdr < 0) {
    throw new Error('parseNDskl: [FILAMENTS] block not found');
  }

  // The very next line is the filament count.
  const countLine = lines[filamentsHdr + 1];
  if (!countLine) throw new Error('parseNDskl: incomplete [FILAMENTS] header');
  const filamentCount = Number(countLine.trim());
  if (!Number.isFinite(filamentCount) || filamentCount < 0) {
    throw new Error(`parseNDskl: bad filament count "${countLine}"`);
  }

  // ── Walk forward, reading each filament's header + samples ────────────
  const strips: FilamentStrip[] = [];
  let cursor = filamentsHdr + 2;
  for (let f = 0; f < filamentCount; f++) {
    const header = lines[cursor++];
    if (!header) {
      throw new Error(
        `parseNDskl: incomplete filament ${f}/${filamentCount}; reached end of input`,
      );
    }
    // header layout: cp_idx_a cp_idx_b n_samples
    const headerParts = header.trim().split(/\s+/);
    if (headerParts.length < 3) {
      throw new Error(`parseNDskl: bad filament header "${header}"`);
    }
    const nSamples = Number(headerParts[2]);
    if (!Number.isFinite(nSamples) || nSamples < 2) {
      throw new Error(
        `parseNDskl: filament ${f} has invalid sample count ${headerParts[2]}`,
      );
    }
    const vertices: Array<[number, number, number]> = [];
    for (let s = 0; s < nSamples; s++) {
      const sampleLine = lines[cursor++];
      if (!sampleLine) {
        throw new Error(
          `parseNDskl: incomplete filament ${f}; expected ${nSamples} samples but ran out`,
        );
      }
      const parts = sampleLine.trim().split(/\s+/);
      if (parts.length < 3) {
        throw new Error(`parseNDskl: bad sample "${sampleLine}" in filament ${f}`);
      }
      vertices.push([Number(parts[0]), Number(parts[1]), Number(parts[2])]);
    }
    strips.push({ vertices, density: new Array<number>(nSamples).fill(NaN) });
  }

  // ── Optional [FILAMENTS DATA] block — per-vertex density ─────────────
  //
  // The block, when present, lists field-value samples for *every* vertex
  // across *every* filament in the same order the [FILAMENTS] block emitted
  // them.  So we re-walk our strips array and consume one density value
  // per vertex.
  const dataHdr = lines.findIndex((l) => l.trim() === '[FILAMENTS DATA]');
  if (dataHdr >= 0) {
    // Skip header + field-count + field-name lines (e.g. "1\nfield_value\n").
    // The format puts the count on the line after [FILAMENTS DATA], then one
    // line per declared field name, then the value rows begin.  We read the
    // count and skip count field-name lines.
    let dataCursor = dataHdr + 1;
    const fieldCount = Number(lines[dataCursor++]?.trim() ?? '0');
    if (Number.isFinite(fieldCount) && fieldCount > 0) {
      dataCursor += fieldCount; // skip the field-name lines
      for (const strip of strips) {
        for (let i = 0; i < strip.vertices.length; i++) {
          const v = lines[dataCursor++];
          if (v === undefined) break;
          const n = Number(v.trim());
          if (Number.isFinite(n)) strip.density[i] = n;
        }
      }
    }
  }

  return { strips };
}
