/**
 * fetchHorizonsChunk — one Horizons VECTORS query (parameters in data/raw/horizons/README.md),
 * retried with a growing pause (the API drops requests under load).
 */
import { parseHorizonsVectorsCsv } from '../../parsers/horizonsVectorsCsv';
import type { HorizonsVectorRow } from '../../parsers/@types/HorizonsVectorRow';
import type { HorizonsBody } from '../../bodies/@types/HorizonsBody';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const MAX_ATTEMPTS = 5;

function queryUrl(body: HorizonsBody, start: string, stop: string): string {
  const params: Record<string, string> = {
    format: 'json',
    COMMAND: `'${body.target}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: `'${body.centre}'`,
    REF_PLANE: "'FRAME'",
    TIME_TYPE: "'UT'",
    OUT_UNITS: "'KM-S'",
    CSV_FORMAT: "'YES'",
    VEC_TABLE: body.vectors === 'state' ? "'2'" : "'1'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${body.stepMinutes} m'`,
  };
  return `${API}?${new URLSearchParams(params).toString()}`;
}

export async function fetchHorizonsChunk(
  body: HorizonsBody,
  start: string,
  stop: string,
): Promise<HorizonsVectorRow[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(queryUrl(body, start, stop));
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const json = (await response.json()) as { result?: string; error?: string };
      if (json.error || !json.result) throw new Error(json.error ?? 'empty result');
      return parseHorizonsVectorsCsv(json.result);
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      console.warn(`fetchHorizons: ${body.id} ${start} attempt ${attempt} failed: ${err}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}
