/**
 * lib/horizonAngleMap.wesl hand-mirrors HORIZON_ANGLE_MAP: `?static` linking injects no
 * values. A drift decodes every baked horizon at a wrong angle, silently: shadows still
 * look plausible, just too long or too short.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { HORIZON_ANGLE_MAP } from '../../../../src/layers/body/surfaceTiles/horizon/data/horizonAngleMap';

it('lib/horizonAngleMap.wesl constants equal HORIZON_ANGLE_MAP', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/services/gpu/shaders/lib/horizonAngleMap.wesl'),
    'utf-8',
  );
  const declared = [...source.matchAll(/const\s+(HORIZON_\w+)\s*:\s*f32\s*=\s*(-?[0-9.]+)\s*;/g)];
  expect(Object.fromEntries(declared.map((m) => [m[1]!, Number(m[2])]))).toEqual({
    HORIZON_MIN_DEG: HORIZON_ANGLE_MAP.minDeg,
    HORIZON_KNEE_DEG: HORIZON_ANGLE_MAP.kneeDeg,
    HORIZON_KNEE_BYTE: HORIZON_ANGLE_MAP.kneeByte,
    HORIZON_MAX_DEG: HORIZON_ANGLE_MAP.maxDeg,
  });
});
