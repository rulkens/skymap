/**
 * asteroidsPass's gate: outside 1900–2100 the dots draw nothing (no stale positions from elements
 * decades off their epoch), and nothing draws before the catalog's rows are on the GPU.
 */
import { describe, expect, it } from 'vitest';
import { asteroidsPass } from '../../../../../src/layers/asteroids/points/passes/asteroidsPass';
import { ASTEROID_WINDOW } from '../../../../../src/layers/asteroids/kepler/data/asteroidWindow';
import type { AsteroidsRuntime } from '../../../../../src/layers/asteroids/@types/AsteroidsRuntime';
import type { AsteroidKeplerRows } from '../../../../../src/layers/asteroids/kepler/@types/AsteroidKeplerRows';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../../src/@types/engine/frame/PassState';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';

const ALL_ON = { nearEarth: 1, mainBelt: 1, hilda: 1, jupiterTrojan: 1, distant: 1 };
const MID_WINDOW = (ASTEROID_WINDOW.startJd + ASTEROID_WINDOW.endJd) / 2;

function enabledAt(simDays: number, rows: AsteroidKeplerRows | null = {} as AsteroidKeplerRows) {
  const pass = asteroidsPass({ solver: { rows: () => rows } } as unknown as AsteroidsRuntime);
  const ctx = { snapshot: { simDays } } as FrameView;
  return pass.enabled({} as PassState, ctx, {} as SlabView, ALL_ON);
}

describe('asteroidsPass', () => {
  it('the pass is disabled outside the window', () => {
    expect(enabledAt(MID_WINDOW)).toBe(true);
    expect(enabledAt(ASTEROID_WINDOW.startJd - 1)).toBe(false);
    expect(enabledAt(ASTEROID_WINDOW.endJd + 1)).toBe(false);
  });

  it('draws nothing until the solver has rows', () => {
    expect(enabledAt(MID_WINDOW, null)).toBe(false);
  });
});
