/**
 * Row kinds bound to a catalog subject (a `FocusId`). Their row shows the subject only (Q22: `→ ◎M31`),
 * and `resolved` reads the concrete effect `resolveClipFoci` made from them, for the inspector's
 * Resolved line. A resolved effect of any other kind reads as an empty string, never throws.
 */
import { formatDegrees } from '../utils/formatDegrees';
import { formatSelectionRef } from '../utils/formatSelectionRef';
import { formatNumber } from '../../utils/format/formatNumber';
import { formatQuantity } from '../../utils/format/formatQuantity';
import { easeField } from '../utils/fields/easeField';
import { overField } from '../utils/fields/overField';
import { subjectField } from '../utils/fields/subjectField';
import { resolvedPosition } from '../utils/resolvedPosition';
import { formatMpc } from '../../utils/format/formatMpc';
import type { RowKindRegistry } from '../../@types/kinds/RowKindRegistry';

export const subjectKinds: Pick<
  RowKindRegistry,
  'moveTargetId' | 'dollyToId' | 'lookAtId' | 'strafeId' | 'spinToId' | 'focusId'
> = {
  moveTargetId: {
    glyph: 'look',
    mark: 'bar',
    writes: () => ['lookAt'],
    label: (s) => ({ name: 'Look-at', op: '→', value: '', subject: s.id }),
    fields: [subjectField(), overField(), easeField()],
    resolved: resolvedPosition,
  },
  dollyToId: {
    glyph: 'dist',
    mark: 'bar',
    writes: () => ['distance'],
    label: (s) => ({
      name: 'Distance',
      op: '→',
      value: '',
      subject: s.id,
      ...(s.scale !== undefined && s.scale !== 1 ? { qualifier: `×${formatNumber(s.scale)}` } : {}),
    }),
    fields: [
      subjectField(),
      { key: 'scale', param: 'scale', label: 'Closeness', control: 'number', fallback: 1 },
      overField(),
      easeField(),
    ],
    resolved: (e) => (e.kind === 'set' ? formatMpc(e.to) : ''),
  },
  lookAtId: {
    glyph: 'aim',
    mark: 'bar',
    writes: () => ['turn'],
    label: (s) => ({ name: 'Aim', op: '→', value: '', subject: s.id }),
    fields: [subjectField(), overField(), easeField()],
    // `aimAt`: an `all` of the yaw tween then the pitch tween.
    resolved: (e) =>
      e.kind === 'all' && e.children[0]?.kind === 'set' && e.children[1]?.kind === 'set'
        ? `${formatDegrees(e.children[0].to)}, ${formatDegrees(e.children[1].to)}`
        : '',
  },
  strafeId: {
    glyph: 'strafe',
    mark: 'bar',
    writes: () => ['lookAt'],
    label: (s) => ({
      name: 'Strafe',
      op: s.byDeg < 0 ? '−' : '+',
      value: formatQuantity(Math.abs(s.byDeg), '°'),
      subject: s.id,
    }),
    fields: [
      subjectField(),
      // Stored in degrees already, unlike the radian angles `degrees` converts.
      { key: 'byDeg', param: 'byDeg', label: 'Sidestep', control: 'number' },
      overField(),
      easeField(),
    ],
    resolved: resolvedPosition,
  },
  spinToId: {
    glyph: 'turn',
    mark: 'bar',
    writes: () => ['turn'],
    label: (s) => ({
      name: 'Turn',
      op: '→',
      value: '',
      subject: s.id,
      ...(s.turns !== undefined && s.turns !== 0
        ? { qualifier: `${s.turns < 0 ? '−' : '+'}${formatNumber(Math.abs(s.turns))} turn` }
        : {}),
    }),
    fields: [
      subjectField(),
      { key: 'turns', param: 'turns', label: 'Extra turns', control: 'number', fallback: 0 },
      overField(),
      easeField(),
    ],
    resolved: (e) => (e.kind === 'spin' ? formatDegrees(e.by) : ''),
  },
  focusId: {
    glyph: 'focus',
    mark: 'cue',
    writes: () => ['settings'],
    label: (s) =>
      s.id === null
        ? { name: 'Focus', op: '', value: 'none' }
        : { name: 'Focus', op: '', value: '', subject: s.id },
    fields: [subjectField()],
    resolved: (e) => (e.kind === 'focus' ? formatSelectionRef(e.ref) : ''),
  },
};
