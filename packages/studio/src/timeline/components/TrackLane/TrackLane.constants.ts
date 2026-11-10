import BarMark from '../marks/BarMark/BarMark';
import CompositeMark from '../marks/CompositeMark/CompositeMark';
import CueMark from '../marks/CueMark/CueMark';
import GapMark from '../marks/GapMark/GapMark';
import GroupMark from '../marks/GroupMark/GroupMark';
import KnotMark from '../marks/KnotMark/KnotMark';
import OscMark from '../marks/OscMark/OscMark';
import RateMark from '../marks/RateMark/RateMark';
import StartMark from '../marks/StartMark/StartMark';
import type { ComponentType } from 'react';
import type { MarkShape } from '../../../@types/kinds/MarkShape';
import type { MarkProps } from '../../@types/MarkProps';

/** The component that draws each mark shape; a row kind names its shape in the registry. */
export const TRACK_MARKS: Record<MarkShape, ComponentType<MarkProps>> = {
  start: StartMark,
  bar: BarMark,
  cue: CueMark,
  gap: GapMark,
  group: GroupMark,
  rate: RateMark,
  osc: OscMark,
  composite: CompositeMark,
  knot: KnotMark,
};

/** A fork's rows put their Background tag left of the mark when the start leaves this much room (percent). */
export const TAG_ROOM_PERCENT = 7;
