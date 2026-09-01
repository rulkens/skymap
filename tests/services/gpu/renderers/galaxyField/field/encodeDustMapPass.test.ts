/**
 * The zero-count call is the CLEARING frame — the one that empties a map the
 * previous galaxy populated. Skipping the whole pass there instead of just its
 * draw would strand that dust in front of the new galaxy, and nothing in the
 * suite can reach `createGalaxyEngine` to catch it, so a fake encoder is the
 * only place the "pass opens, draw does not" split is observable.
 */
import { describe, expect, it } from 'vitest';

import { encodeDustMapPass } from '../../../../../../src/services/gpu/renderers/galaxyField/field/encodeDustMapPass';

type Fake = {
  enc: GPUCommandEncoder;
  /** Load ops of every pass opened, in order. */
  opened: (GPULoadOp | undefined)[];
  /** Instance count of every draw issued, in order. */
  draws: number[];
};

function makeFake(): Fake {
  const opened: (GPULoadOp | undefined)[] = [];
  const draws: number[] = [];
  const enc = {
    beginRenderPass: (desc: GPURenderPassDescriptor) => {
      opened.push([...desc.colorAttachments][0]?.loadOp);
      return {
        setPipeline: () => {},
        setBindGroup: () => {},
        draw: (_vertices: number, instances: number) => draws.push(instances),
        end: () => {},
      } as unknown as GPURenderPassEncoder;
    },
  } as unknown as GPUCommandEncoder;
  return { enc, opened, draws };
}

function encode(fake: Fake, instanceCount: number): boolean {
  return encodeDustMapPass({
    enc: fake.enc,
    targetView: {} as GPUTextureView,
    pipeline: {} as GPURenderPipeline,
    bindGroup: {} as GPUBindGroup,
    instanceCount,
  });
}

describe('encodeDustMapPass', () => {
  it('opens the clearing pass but issues no draw when there is nothing to splat', () => {
    const fake = makeFake();
    const populated = encode(fake, 0);

    expect(fake.opened).toEqual(['clear']);
    expect(fake.draws).toEqual([]);
    expect(populated).toBe(false);
  });

  it('draws and reports the map populated when there is dust', () => {
    const fake = makeFake();
    const populated = encode(fake, 7);

    expect(fake.draws).toEqual([7]);
    expect(populated).toBe(true);
  });
});
