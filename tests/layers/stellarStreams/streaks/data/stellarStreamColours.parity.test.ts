import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { STREAM_BP_RP_RANGE } from '../../../../../src/layers/stellarStreams/streaks/data/stellarStreamColours.constants';

const wesl = readFileSync(
  join(process.cwd(), 'src/services/gpu/shaders/stellarStreams/streaks/vertex.wesl'),
  'utf-8',
);

it('the shader decodes colour t over the same BP−RP span the build and the captions use', () => {
  const m = /const STREAM_BP_RP_RANGE: vec2<f32> = vec2<f32>\(([^)]*)\)/.exec(wesl);
  expect(m?.[1]!.split(',').map(Number)).toEqual([...STREAM_BP_RP_RANGE]);
  expect(wesl).toContain('starTint(bpRp)');
});
