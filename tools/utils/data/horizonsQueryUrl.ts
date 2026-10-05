/**
 * horizonsQueryUrl — one Horizons VECTORS query for a `HorizonsBody` over `[start, stop]`.
 * The parameter list is documented in data/raw/horizons/README.md.
 */
import type { HorizonsBody } from '../../bodies/@types/HorizonsBody';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

export function horizonsQueryUrl(body: HorizonsBody, start: string, stop: string): string {
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
