/**
 * stellarStreamsSelectionRow — the `stellarStream` selection kind. The ref is the meta slug; the
 * pick index is the stream's meta position, which is its index in the bin (the pair check holds
 * the two in step). Everything reads the meta alone, so a deep link resolves before the bin lands.
 */
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { encodeStellarStreamFocusId } from './utils/encodeStellarStreamFocusId';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { StellarStreamsRuntime } from '../@types/StellarStreamsRuntime';
import type { StellarStreamRef } from './@types/StellarStreamRef';
import type { StellarStreamSelectionRow } from './@types/StellarStreamSelectionRow';

const FOCUS_ID = /^stream-([a-z0-9-]+)$/;

export function stellarStreamsSelectionRow(
  runtime: StellarStreamsRuntime,
): SelectionKindRow<StellarStreamRef> {
  const indexOf = (slug: string): number => runtime.meta()?.findIndex((m) => m.id === slug) ?? -1;
  return {
    type: 'stellarStream',
    pickSources: [runtime.pickCode],
    resolvePick: (pick) => {
      const slug = runtime.meta()?.[pick.localIdx]?.id;
      return slug === undefined ? null : { type: 'stellarStream', slug };
    },
    encodePick: (ref) => {
      const k = indexOf(ref.slug);
      return k < 0 ? null : packSelection(runtime.pickCode, k + PICK_SENTINEL_OFFSET);
    },
    extractRow: (ref): StellarStreamSelectionRow | null => {
      const entry = runtime.meta()?.[indexOf(ref.slug)];
      if (entry === undefined) return null;
      const { anchorMpc, centrelineMpc, ribbonWidthKpc, ...rest } = entry;
      return {
        ...rest,
        type: 'stellarStream',
        positionMpc: [anchorMpc[0], anchorMpc[1], anchorMpc[2]],
        radiusMpc: entry.frameRadiusKpc * SCALE_UNITS.KPC_TO_MPC,
        focusRegion: 'subjectOnly',
      };
    },
    focusId: {
      claims: (id) => FOCUS_ID.test(id),
      decode: (id) => {
        const match = FOCUS_ID.exec(id);
        return match ? { type: 'stellarStream', slug: match[1]! } : null;
      },
      encode: (ref) => encodeStellarStreamFocusId(ref.slug),
    },
  };
}
