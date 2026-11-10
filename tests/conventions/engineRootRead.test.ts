/**
 * The engine reads the root through `readRoot()` (`engine.ts`) and nowhere else, so a playing
 * clip's scene overlay reaches every engine reader at once; a bypass would silently show the
 * user's intent in that one subsystem while the clip plays, and no other test notices. ALLOWED
 * counts `.getState()` calls per file and only ever shrinks: engine.ts defines the seam,
 * clipPlayer reads `camera.clip`, the pick driver reads its request queue.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { walkFiles } from '../helpers/conventions/walkFiles';

const ALLOWED: Readonly<Record<string, number>> = {
  'src/services/engine/engine.ts': 1,
  'src/services/engine/subsystems/clipPlayer.ts': 2,
  'src/services/engine/interaction/createPickDriver.ts': 1,
};

const isComment = (line: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(line);

describe('engine root read', () => {
  it('reads the root only through readRoot()', () => {
    const offenders = ['src/services/engine', 'src/layers']
      .flatMap((dir) => walkFiles(dir, ['.ts', '.tsx']))
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .flatMap((file) => {
        const hits = readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, i) => (!isComment(line) && /\.getState\(\)/.test(line) ? [i + 1] : []));
        if (hits.length === (ALLOWED[file] ?? 0)) return [];
        return [`${file}:${hits.join(',')}`];
      });
    expect(
      offenders,
      `${offenders.join('\n')}\nread the root through \`readRoot()\` so a playing clip's scene reaches it`,
    ).toEqual([]);
  });
});
