/**
 * inputBindings — the engine's resize wake. Vitest runs `node` here (no
 * jsdom), so a recorder stands in for `window` and the test fires by type.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { attachEngineInputs } from '../../../../src/services/engine/interaction/inputBindings';
import type { RenderScheduler } from '../../../../src/@types/engine/subsystems/RenderScheduler';

type Listener = (e: unknown) => void;

let listeners: Array<{ type: string; handler: Listener }>;
let originalWindow: unknown;

const fire = (type: string): void => {
  for (const l of [...listeners]) if (l.type === type) l.handler({});
};

const scheduler: RenderScheduler = {
  requestRender: vi.fn(),
  nextFrame: () => Promise.resolve(),
  requestIdleFrame: vi.fn(),
  destroy: vi.fn(),
  isScheduled: () => false,
};

beforeEach(() => {
  listeners = [];
  const g = globalThis as unknown as Record<string, unknown>;
  originalWindow = g.window;
  g.window = {
    addEventListener: (type: string, handler: Listener) => listeners.push({ type, handler }),
    removeEventListener: (type: string, handler: Listener) => {
      listeners = listeners.filter((l) => l.type !== type || l.handler !== handler);
    },
  };
  vi.mocked(scheduler.requestRender).mockClear();
});

afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  if (originalWindow === undefined) delete g.window;
  else g.window = originalWindow;
});

describe('attachEngineInputs', () => {
  it('a window resize wakes the loop', () => {
    attachEngineInputs({ scheduler });
    fire('resize');
    expect(scheduler.requestRender).toHaveBeenCalledTimes(1);
  });

  it('destroy() removes the resize listener', () => {
    attachEngineInputs({ scheduler }).destroy();
    expect(listeners).toHaveLength(0);
    fire('resize');
    expect(scheduler.requestRender).not.toHaveBeenCalled();
  });
});
