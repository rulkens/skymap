import { describe, expect, it } from 'vitest';
import type { GizmoHandleId } from '../../../../tools/mcpm-workbench/@types/GizmoHandleId';
import { encodeGizmoHandleId } from '../../../../tools/mcpm-workbench/src/gizmo/encodeGizmoHandleId';

describe('encodeGizmoHandleId', () => {
  it('encodes a resize id: kind 1, axis 2, sign -1 -> 1*100 + 2*10 + 1 = 121', () => {
    const id: GizmoHandleId = { kind: 'resize', axis: 2, sign: -1 };
    expect(encodeGizmoHandleId(id)).toBe(121);
  });

  it('encodes null as -1', () => {
    expect(encodeGizmoHandleId(null)).toBe(-1);
  });
});
