import type { ComponentType } from 'react';
import type { IconProps } from '../../../../../src/components/Icon/Icon';
import type { GlyphId } from '../../@types/kinds/GlyphId';
import AimAlongIcon from '../../../../../src/components/icons/AimAlongIcon/AimAlongIcon';
import AimIcon from '../../../../../src/components/icons/AimIcon/AimIcon';
import AlertIcon from '../../../../../src/components/icons/AlertIcon/AlertIcon';
import CameraIcon from '../../../../../src/components/icons/CameraIcon/CameraIcon';
import CubeIcon from '../../../../../src/components/icons/CubeIcon/CubeIcon';
import DistanceIcon from '../../../../../src/components/icons/DistanceIcon/DistanceIcon';
import EndFlagIcon from '../../../../../src/components/icons/EndFlagIcon/EndFlagIcon';
import EyeIcon from '../../../../../src/components/icons/EyeIcon/EyeIcon';
import EyeOffIcon from '../../../../../src/components/icons/EyeOffIcon/EyeOffIcon';
import FadeIcon from '../../../../../src/components/icons/FadeIcon/FadeIcon';
import FlyPathIcon from '../../../../../src/components/icons/FlyPathIcon/FlyPathIcon';
import FocusIcon from '../../../../../src/components/icons/FocusIcon/FocusIcon';
import ForkIcon from '../../../../../src/components/icons/ForkIcon/ForkIcon';
import FrameIcon from '../../../../../src/components/icons/FrameIcon/FrameIcon';
import GripIcon from '../../../../../src/components/icons/GripIcon/GripIcon';
import JoinBlendIcon from '../../../../../src/components/icons/JoinBlendIcon/JoinBlendIcon';
import JoinNoStopIcon from '../../../../../src/components/icons/JoinNoStopIcon/JoinNoStopIcon';
import JoinStopIcon from '../../../../../src/components/icons/JoinStopIcon/JoinStopIcon';
import LayersIcon from '../../../../../src/components/icons/LayersIcon/LayersIcon';
import LockIcon from '../../../../../src/components/icons/LockIcon/LockIcon';
import LookIcon from '../../../../../src/components/icons/LookIcon/LookIcon';
import LoopIcon from '../../../../../src/components/icons/LoopIcon/LoopIcon';
import MagnetIcon from '../../../../../src/components/icons/MagnetIcon/MagnetIcon';
import OrbitIcon from '../../../../../src/components/icons/OrbitIcon/OrbitIcon';
import OscillateIcon from '../../../../../src/components/icons/OscillateIcon/OscillateIcon';
import ParallelIcon from '../../../../../src/components/icons/ParallelIcon/ParallelIcon';
import PauseIcon from '../../../../../src/components/icons/PauseIcon/PauseIcon';
import PinIcon from '../../../../../src/components/icons/PinIcon/PinIcon';
import PlanetIcon from '../../../../../src/components/icons/PlanetIcon/PlanetIcon';
import PlayIcon from '../../../../../src/components/icons/PlayIcon/PlayIcon';
import PointIcon from '../../../../../src/components/icons/PointIcon/PointIcon';
import RateIcon from '../../../../../src/components/icons/RateIcon/RateIcon';
import RedoIcon from '../../../../../src/components/icons/RedoIcon/RedoIcon';
import RollIcon from '../../../../../src/components/icons/RollIcon/RollIcon';
import SequenceIcon from '../../../../../src/components/icons/SequenceIcon/SequenceIcon';
import SettleIcon from '../../../../../src/components/icons/SettleIcon/SettleIcon';
import SlidersIcon from '../../../../../src/components/icons/SlidersIcon/SlidersIcon';
import StrafeIcon from '../../../../../src/components/icons/StrafeIcon/StrafeIcon';
import SubjectIcon from '../../../../../src/components/icons/SubjectIcon/SubjectIcon';
import SwapViewsIcon from '../../../../../src/components/icons/SwapViewsIcon/SwapViewsIcon';
import TimeIcon from '../../../../../src/components/icons/TimeIcon/TimeIcon';
import UndoIcon from '../../../../../src/components/icons/UndoIcon/UndoIcon';
import WaitIcon from '../../../../../src/components/icons/WaitIcon/WaitIcon';
import WaypointIcon from '../../../../../src/components/icons/WaypointIcon/WaypointIcon';

/** Which app icon draws each glyph id; the registry itself stays plain strings, no React. */
export const GLYPH_ICONS: Record<GlyphId, ComponentType<Pick<IconProps, 'size'>>> = {
  start: PlayIcon,
  wait: WaitIcon,
  hold: PauseIcon,
  dist: DistanceIcon,
  look: LookIcon,
  aim: AimIcon,
  aimAlong: AimAlongIcon,
  turn: OrbitIcon,
  rate: RateIcon,
  osc: OscillateIcon,
  hide: EyeOffIcon,
  show: EyeIcon,
  fade: FadeIcon,
  set: SlidersIcon,
  focus: FocusIcon,
  seq: SequenceIcon,
  all: ParallelIcon,
  fork: ForkIcon,
  layers: LayersIcon,
  settings: SlidersIcon,
  jstop: JoinStopIcon,
  jnostop: JoinNoStopIcon,
  jblend: JoinBlendIcon,
  end: EndFlagIcon,
  loop: LoopIcon,
  magnet: MagnetIcon,
  undo: UndoIcon,
  redo: RedoIcon,
  warn: AlertIcon,
  grip: GripIcon,
  subject: SubjectIcon,
  strafe: StrafeIcon,
  frame: FrameIcon,
  roll: RollIcon,
  clock: TimeIcon,
  body: PlanetIcon,
  fly: FlyPathIcon,
  pass: WaypointIcon,
  settle: SettleIcon,
  point: PointIcon,
  lock: LockIcon,
  pin: PinIcon,
  swap: SwapViewsIcon,
  edit: CubeIcon,
  camera: CameraIcon,
};
