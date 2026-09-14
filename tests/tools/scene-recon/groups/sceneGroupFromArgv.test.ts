// A typo'd `--group` must stop the CLI, not silently bake the default group's
// data into the wrong output directory.
import { describe, expect, it } from 'vitest';

import { sceneGroupFromArgv } from '../../../../tools/scene-recon/groups/sceneGroupFromArgv';

describe('sceneGroupFromArgv', () => {
  it('names the known ids when the flag does not match one', () => {
    expect(() => sceneGroupFromArgv(['node', 'bake.ts', '--group', 'soendermarken-crp'])).toThrow(
      /soendermarken, soendermarken-crop/,
    );
  });

  it('defaults to the whole-frame group', () => {
    expect(sceneGroupFromArgv(['node', 'bake.ts']).id).toBe('soendermarken');
  });
});
