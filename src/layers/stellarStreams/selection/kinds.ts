import { STELLAR_STREAM_FOCUS } from './data/stellarStreamFocus.constants';
import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { StellarStreamRef } from './@types/StellarStreamRef';
import type { StellarStreamSelectionRow } from './@types/StellarStreamSelectionRow';
import type { StellarStreamTarget } from './@types/StellarStreamTarget';

export const stellarStreamsSelectionKinds: readonly SelectionKindFacts<
  StellarStreamRef,
  StellarStreamSelectionRow,
  StellarStreamTarget
>[] = [
  {
    type: 'stellarStream',
    focus: STELLAR_STREAM_FOCUS,
    // Any stream may be captioned: a hovered short stream gains one, so hover must wake the loop.
    mayHaveLabel: () => true,
    toFocusable: (row) => ({ ...row, ref: { type: 'stellarStream', slug: row.id } }),
    displayName: (target) => target.names[0]!,
  },
];
