/**
 * EpochRow — the epoch a driver measures on, and the row its win makes eligible
 * to advance. `frameTween` is excluded: no driver authors the roll, so
 * `resolveFrameBasis` reads that row whoever won.
 */
import type { CameraEpochs } from './CameraEpochs';

export type EpochRow = Exclude<keyof CameraEpochs, 'frameTween'>;
