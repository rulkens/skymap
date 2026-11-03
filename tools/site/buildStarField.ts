/**
 * Bake the website's background sky: every Hipparcos-2 star down to naked-eye depth, laid on a band round the
 * great circle through the poles and Orion's belt, binned by its parallax distance into the page's depth layers,
 * coloured with the app's own B−V tint ramp. Writes packages/website/src/assets/starField.bin (layout in
 * packages/website/src/data/starFieldFormat.ts); the page's script draws it (components/site/StarField/).
 * Needs data/raw/gaia/hip2.dat (`npm run fetch-gaia`, or a symlink to the main checkout's copy).
 *
 *   npx tsx tools/site/buildStarField.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

import type { StarField } from '../../packages/website/src/@types/StarField';
import type { StarFieldLayer } from '../../packages/website/src/@types/StarFieldLayer';
import { linearRgbToHex } from '../../src/utils/color/linearRgbToHex';
import { starTintFromBpRp } from '../../src/utils/color/starTintFromBpRp';
import { parseHipparcos2 } from '../parsers/hipparcos2';
import { bvToBpRp } from '../utils/color/bvToBpRp';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { encodeStarField } from './utils/encodeStarField';
import { starBandPosition } from './utils/starBandPosition';
import { starDistanceLayer } from './utils/starDistanceLayer';

const OUTPUT = 'packages/website/src/assets/starField.bin';
// Hp, about V: the faintest stars a dark sky shows, a few thousand over the whole sky.
const MAG_LIMIT = 6;
// Orion's belt (Alnilam, 5h 36m): every page opens on Orion, north up.
const CENTRE_RA_DEG = 84;
// In Mercator degrees (50° true): past the widest screen's edge, so a star never pops in at the side.
const ACROSS_LIMIT_DEG = 58;
const NEAREST_EDGE_PC = 25;
const LAYER_COUNT = 6;
// The tint ramp sampled every 0.2 mag of B−V, from blue-white O/B to red M.
const BV_MIN = -0.3;
const BV_STEP = 0.2;
const TINTS = 12;

const { rows } = parseHipparcos2(readFileSync(rawDataPath('gaia.hipparcos'), 'utf8'));
const stars = rows
  .filter((row) => row.hpMag <= MAG_LIMIT)
  .map((row) => ({ row, at: starBandPosition(row.raDeg, row.decDeg, CENTRE_RA_DEG) }))
  .filter(({ at }) => Math.abs(at.across) <= ACROSS_LIMIT_DEG)
  .map((star) => ({ ...star, layer: starDistanceLayer(star.row.distPc, NEAREST_EDGE_PC, LAYER_COUNT) }))
  .sort((a, b) => a.layer - b.layer || a.at.along - b.at.along);

const n = stars.length;
const field: StarField = {
  layers: [],
  palette: Array.from({ length: TINTS }, (_, i) => linearRgbToHex(starTintFromBpRp(bvToBpRp(BV_MIN + i * BV_STEP)))),
  along: new Float32Array(n),
  across: new Float32Array(n),
  mag: new Float32Array(n),
  tint: new Uint8Array(n),
};
stars.forEach(({ row, at }, i) => {
  field.along[i] = at.along;
  field.across[i] = at.across;
  field.mag[i] = row.hpMag;
  field.tint[i] = Math.min(TINTS - 1, Math.max(0, Math.round((row.bv - BV_MIN) / BV_STEP)));
});
const layers: StarFieldLayer[] = [];
for (let layer = 0, start = 0; layer < LAYER_COUNT; layer++) {
  const distances = stars.filter((star) => star.layer === layer).map((star) => star.row.distPc);
  distances.sort((a, b) => a - b);
  const end = start + distances.length;
  layers.push({ distancePc: distances[Math.floor(distances.length / 2)] ?? 0, end });
  console.log(`layer ${layer}: ${distances.length} stars, median ${layers[layer]!.distancePc.toFixed(1)} pc`);
  start = end;
}
const bytes = encodeStarField({ ...field, layers });
writeFileSync(OUTPUT, bytes);
console.log(`${OUTPUT}  ${n} stars  ${bytes.length} B  (${gzipSync(bytes).length} B gzipped)`);
