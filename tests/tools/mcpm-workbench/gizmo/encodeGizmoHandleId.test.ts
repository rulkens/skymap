import { describe, expect, it } from 'vitest';
import type { GizmoHandleId } from '../../../../tools/mcpm-workbench/@types/GizmoHandleId';
import { encodeGizmoHandleId } from '../../../../tools/mcpm-workbench/src/gizmo/encodeGizmoHandleId';

describe('encodeGizmoHandleId', () => {
  it('encodes a translate id: kind 0, axis 1 -> 0*100 + 1*10 + 0 = 10', () => {
    const id: GizmoHandleId = { kind: 'translate', axis: 1 };
    expect(encodeGizmoHandleId(id)).toBe(10);
  });

  it('encodes a resize id: kind 1, axis 2, sign -1 -> 1*100 + 2*10 + 1 = 121', () => {
    const id: GizmoHandleId = { kind: 'resize', axis: 2, sign: -1 };
    expect(encodeGizmoHandleId(id)).toBe(121);
  });

  it('encodes a resize id with sign +1 -> the sign bit stays 0: 1*100 + 0*10 + 0 = 100', () => {
    const id: GizmoHandleId = { kind: 'resize', axis: 0, sign: 1 };
    expect(encodeGizmoHandleId(id)).toBe(100);
  });

  it('encodes a rotate id: kind 2, axis 0 -> 2*100 + 0*10 + 0 = 200', () => {
    const id: GizmoHandleId = { kind: 'rotate', axis: 0 };
    expect(encodeGizmoHandleId(id)).toBe(200);
  });

  it('encodes null as -1', () => {
    expect(encodeGizmoHandleId(null)).toBe(-1);
  });
});
