/**
 * labels/io.wesl `LabelData` and the label shader's lift constants vs the TS
 * side `packLabels` writes and the CPU twins read. A drift reads garbage on
 * the GPU, or lifts a label off where declutter and pick think it is.
 */
import { describe, expect, it } from 'vitest';
import {
  LABEL_DATA_BYTES,
  LABEL_DATA_OFFSETS,
} from '../../../../src/data/labels/labelBufferStrides';
import { LABEL_LIFT } from '../../../../src/data/labels/labelLift';
import {
  LEADER_LIFT_FACTOR,
  MIN_LABEL_CLEARANCE_PX,
} from '../../../../src/services/engine/presentation/leaderLineStyle';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';

function weslConstant(path: string, name: string): number {
  const match = new RegExp(`const\\s+${name}\\s*:\\s*(?:u32|f32)\\s*=\\s*([0-9.]+)[uf]?\\s*;`).exec(
    readShaderSource(path),
  );
  if (!match) throw new Error(`${name} not found in ${path}`);
  return parseFloat(match[1]!);
}

describe('labels/io.wesl LabelData parity', () => {
  it('lays out where packLabels writes it', () => {
    const { offsets, layout } = layoutWgslStruct(
      parseWgslStructFields(
        readShaderSource('src/services/gpu/shaders/labels/io.wesl'),
        'LabelData',
      ),
      (type) => wgslPrimitiveLayout(type)!,
    );
    expect(Object.fromEntries(offsets)).toEqual(LABEL_DATA_OFFSETS);
    expect(layout.size).toBe(LABEL_DATA_BYTES);
  });

  it('names the same lift kinds as LABEL_LIFT', () => {
    const io = 'src/services/gpu/shaders/labels/io.wesl';
    expect(weslConstant(io, 'LIFT_NONE')).toBe(LABEL_LIFT.none);
    expect(weslConstant(io, 'LIFT_LEADER_FROM_CENTRE')).toBe(LABEL_LIFT.leaderFromCentre);
    expect(weslConstant(io, 'LIFT_LEADER_FROM_RIM')).toBe(LABEL_LIFT.leaderFromRim);
  });

  it('lifts by the same constants as labelLiftPx', () => {
    const vertex = 'src/services/gpu/shaders/labels/vertex.wesl';
    expect(weslConstant(vertex, 'MIN_LABEL_CLEARANCE_PX')).toBe(MIN_LABEL_CLEARANCE_PX);
    expect(weslConstant(vertex, 'LEADER_LIFT_FACTOR')).toBe(LEADER_LIFT_FACTOR);
  });
});
