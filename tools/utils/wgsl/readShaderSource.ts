/**
 * Shader source as text, by repo-relative path. `process.cwd()` rather than
 * `__dirname`, which does not survive Vitest's ESM runner.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readShaderSource(repoRelativePath: string): string {
  return readFileSync(join(process.cwd(), repoRelativePath), 'utf-8');
}
