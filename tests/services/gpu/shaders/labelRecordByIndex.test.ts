/**
 * No label shader function takes a `LabelRecord` by value. On Adreno (Android) the
 * callee then reads alpha as 0 and every label is hidden; only a phone shows it.
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';

const DIR = 'src/services/gpu/shaders/labels';

describe('label shaders pass records by index', () => {
  it.each(readdirSync(DIR).filter((f) => f.endsWith('.wesl')))('%s', (file) => {
    expect(readShaderSource(`${DIR}/${file}`)).not.toMatch(/fn \w+\([^)]*:\s*LabelRecord\b/);
  });
});
