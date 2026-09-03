/**
 * readPdalCsv — streams a `writers.text` csv (header row `PDAL_CSV_COLUMNS`,
 * see lidarPipelineStages) into packer records one line at a time via
 * `readline`, so a hundred-megabyte bake never sits fully in memory.
 *
 * Strict on purpose: `Number('')` is `0`, not `NaN`, so a silently-truncated
 * row would otherwise pack as a plausible-looking zero coordinate instead
 * of failing the bake.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import { PDAL_CSV_COLUMNS } from './lidarPipelineStages';
import type { ScenePoint } from '../pack/packPoints';

const FIELD_NAMES = ['X', 'Y', 'Z', 'Red', 'Green', 'Blue', 'Classification'] as const;

function parseField(raw: string | undefined, lineNumber: number, fieldName: string): number {
  const value = Number(raw);
  if (raw === undefined || raw.length === 0 || !Number.isFinite(value)) {
    throw new Error(
      `${csvContext(lineNumber)}: field "${fieldName}" is not a finite number (got ${JSON.stringify(raw)})`,
    );
  }
  return value;
}

function csvContext(lineNumber: number): string {
  return `readPdalCsv: line ${lineNumber}`;
}

export async function* readPdalCsv(csvPath: string): AsyncIterable<ScenePoint> {
  const lines = createInterface({
    input: createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  let sawHeader = false;
  for await (const line of lines) {
    lineNumber++;
    if (!sawHeader) {
      sawHeader = true;
      if (line !== PDAL_CSV_COLUMNS) {
        throw new Error(
          `${csvContext(lineNumber)}: expected header "${PDAL_CSV_COLUMNS}", got ${JSON.stringify(line)}`,
        );
      }
      continue;
    }
    if (line.length === 0) continue;

    const fields = line.split(',');
    const [x, y, z, r, g, b, classification] = FIELD_NAMES.map((name, i) =>
      parseField(fields[i], lineNumber, name),
    );
    yield { xM: x!, yM: y!, zM: z!, r: r!, g: g!, b: b!, classification: classification! };
  }

  if (!sawHeader) {
    throw new Error(`readPdalCsv: file is empty, expected header "${PDAL_CSV_COLUMNS}"`);
  }
}
