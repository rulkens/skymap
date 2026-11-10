/**
 * `npm run bake-clouds -- --out <file.webp> [--date YYYY-MM-DD] [--offline]` — fills the Rust cloud bake's
 * path flags from the raw-data registry and runs it. The launcher always passes `--date` (default
 * yesterday, UTC) so its Blue Marble month and the baked day cannot disagree around midnight. Exits with the binary's code (see tools/cloud-bake-rs/README.md);
 * 2 here also means the month's Blue Marble file has not been fetched.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { bmngMonthKey } from '../utils/io/bmngMonthKey';
import { rawDataPath } from '../utils/io/rawDataRegistry';

const { values } = parseArgs({
  options: { date: { type: 'string' }, out: { type: 'string' }, offline: { type: 'boolean' } },
});

if (!values.out) {
  console.error('bakeClouds: --out <file.webp> is required');
  process.exit(2);
}

const MS_PER_DAY = 86_400_000;
const day = values.date ?? new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
  console.error(`bakeClouds: --date must be YYYY-MM-DD, got ${day}`);
  process.exit(2);
}
const blueMarble = rawDataPath(bmngMonthKey(Number(day.slice(5, 7))));
if (!existsSync(blueMarble)) {
  console.error(
    `bakeClouds: ${blueMarble} is missing; run \`npm run fetch-cloud-inputs -- --confirm\``,
  );
  process.exit(2);
}

const flags = [
  '--date',
  day,
  '--baseline',
  rawDataPath('textures.earthClouds'),
  '--blue-marble',
  blueMarble,
  '--cache',
  rawDataPath('clouds.cache'),
  '--out',
  values.out,
  ...(values.offline ? ['--offline'] : []),
];
const { status } = spawnSync(
  'cargo',
  ['run', '--release', '--manifest-path', 'tools/cloud-bake-rs/Cargo.toml', '--', ...flags],
  { stdio: 'inherit' },
);
process.exit(status ?? 1);
