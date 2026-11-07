import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import {
  STREAM_BHB_RGB,
  STREAM_GIANT_RGB,
} from '../../../../../src/layers/stellarStreams/streaks/data/stellarStreamColours.constants';

const wesl = readFileSync(
  join(process.cwd(), 'src/services/gpu/shaders/stellarStreams/streams.wesl'),
  'utf-8',
);
const constOf = (name: string): number[] => {
  const m = new RegExp(`const ${name}: vec3<f32> = vec3<f32>\\(([^)]*)\\)`).exec(wesl);
  if (!m) throw new Error(`${name} not found in streams.wesl`);
  return m[1]!.split(',').map(Number);
};

it("the shader's BHB and GIANT equal the caption palette's ends", () => {
  expect(constOf('BHB')).toEqual([...STREAM_BHB_RGB]);
  expect(constOf('GIANT')).toEqual([...STREAM_GIANT_RGB]);
});
