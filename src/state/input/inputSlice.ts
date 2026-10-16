/**
 * inputSlice — every source's intents, folded into the steps the next frame
 * drains (`pending`) and the pick requests the pick driver answers (`pick`).
 *
 * One source at a time owns a held gesture; a second source's start takes it
 * over by closing the first. Unheld motion (a wheel notch with no gesture open)
 * passes from any source. Motion is stamped with its source's aspect when it is
 * folded, so a resize never re-reads motion already queued.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { InputState } from '../../@types/input/InputState';
import type { SourceId } from '../../@types/input/SourceId';
import type { HeldIntent } from '../../@types/input/HeldIntent';
import type { Motion } from '../../@types/input/Motion';
import type { UnitPoint } from '../../@types/input/UnitPoint';

const initialState: InputState = {
  sources: {},
  owner: null,
  pending: [],
  pick: { hover: null, select: null },
  pickSeq: 0,
};

const inputSlice = createSlice({
  name: 'input',
  initialState,
  reducers: {
    inputSourceAttached: (input, action: PayloadAction<{ source: SourceId; aspect: number }>) => {
      input.sources[action.payload.source] = { aspect: action.payload.aspect };
    },
    inputSourceResized: (input, action: PayloadAction<{ source: SourceId; aspect: number }>) => {
      input.sources[action.payload.source] = { aspect: action.payload.aspect };
    },
    inputSourceDetached: (input, action: PayloadAction<{ source: SourceId }>) => {
      delete input.sources[action.payload.source];
    },

    inputGestureStarted: (
      input,
      action: PayloadAction<{ source: SourceId; intent: HeldIntent }>,
    ) => {
      const { source } = action.payload;
      if (input.owner !== null && input.owner !== source) {
        input.pending.push({ kind: 'end', source: input.owner });
      }
      input.owner = source;
      input.pending.push({ kind: 'start', source });
      input.pick.hover = { source, at: null, seq: ++input.pickSeq };
    },
    inputGestureEnded: (input, action: PayloadAction<{ source: SourceId }>) => {
      if (input.owner !== action.payload.source) return;
      input.pending.push({ kind: 'end', source: input.owner });
      input.owner = null;
    },

    inputMoved: (input, action: PayloadAction<{ source: SourceId; motion: readonly Motion[] }>) => {
      const { source, motion } = action.payload;
      const record = input.sources[source];
      if (record === undefined) return;
      for (const m of motion) {
        if (m.held && input.owner !== source) continue;
        const tail = input.pending[input.pending.length - 1];
        if (
          tail?.kind === 'motion' &&
          tail.source === source &&
          tail.intent === m.intent &&
          tail.held === m.held &&
          tail.aspect === record.aspect
        ) {
          input.pending[input.pending.length - 1] = {
            ...tail,
            dx: tail.dx + m.dx,
            dy: tail.dy + m.dy,
            ratio: tail.ratio * m.ratio,
            at: m.at,
          };
        } else {
          input.pending.push({ kind: 'motion', source, aspect: record.aspect, ...m });
        }
      }
    },

    inputHovered: (input, action: PayloadAction<{ source: SourceId; at: UnitPoint | null }>) => {
      if (input.owner !== null) return;
      input.pick.hover = { ...action.payload, seq: ++input.pickSeq };
    },
    inputTapped: (input, action: PayloadAction<{ source: SourceId; at: UnitPoint }>) => {
      input.pick.select = { ...action.payload, seq: ++input.pickSeq };
    },

    // Clearing everything is exact, not lossy: `runFrame` reads the snapshot and
    // dispatches this in one synchronous task, and every source dispatch runs in
    // its own task, so nothing can land between the read and the clear.
    inputConsumed: (input) => {
      input.pending = [];
    },
    inputPickResolved: (
      input,
      action: PayloadAction<{ which: 'hover' | 'select'; seq: number }>,
    ) => {
      const { which, seq } = action.payload;
      if (input.pick[which]?.seq === seq) input.pick[which] = null;
    },
  },
});

export const {
  inputSourceAttached,
  inputSourceResized,
  inputSourceDetached,
  inputGestureStarted,
  inputGestureEnded,
  inputMoved,
  inputHovered,
  inputTapped,
  inputConsumed,
  inputPickResolved,
} = inputSlice.actions;

export default inputSlice.reducer;
