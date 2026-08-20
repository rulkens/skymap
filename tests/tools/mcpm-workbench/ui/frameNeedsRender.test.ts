import { describe, expect, it } from 'vitest';
import { frameNeedsRender } from '../../../../tools/mcpm-workbench/src/ui/frameNeedsRender';

const BASE = {
  dirty: false,
  simRunning: false,
  pathTracerOn: false,
  pathTracerSampleCount: 0,
  pathTracerSampleCap: 10,
  holdUntilMs: 0,
  nowMs: 1000,
};

describe('frameNeedsRender', () => {
  it('is false when every term is quiet', () => {
    expect(frameNeedsRender(BASE)).toBe(false);
  });

  it('renders on a dirty flag alone', () => {
    expect(frameNeedsRender({ ...BASE, dirty: true })).toBe(true);
  });

  it('renders while the sim is running, dirty or not', () => {
    expect(frameNeedsRender({ ...BASE, simRunning: true })).toBe(true);
  });

  it('renders while the path tracer is on and under its sample cap', () => {
    expect(frameNeedsRender({ ...BASE, pathTracerOn: true, pathTracerSampleCount: 9 })).toBe(true);
  });

  it('goes idle once the path tracer reaches its sample cap', () => {
    expect(frameNeedsRender({ ...BASE, pathTracerOn: true, pathTracerSampleCount: 10 })).toBe(
      false,
    );
  });

  it('a capped path tracer that is OFF never forces a render', () => {
    expect(frameNeedsRender({ ...BASE, pathTracerOn: false, pathTracerSampleCount: 0 })).toBe(
      false,
    );
  });

  it('renders right up to the hold deadline', () => {
    expect(frameNeedsRender({ ...BASE, holdUntilMs: 1001, nowMs: 1000 })).toBe(true);
  });

  it('is idle exactly at the hold deadline', () => {
    expect(frameNeedsRender({ ...BASE, holdUntilMs: 1000, nowMs: 1000 })).toBe(false);
  });
});
