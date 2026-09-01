import type { PayloadAction } from '@reduxjs/toolkit';
import type { RaymarchSliderKey } from '../../../../@types/RaymarchSliderKey';
import {
  setOpticalThickness,
  setSampleWeight,
  setStepVoxels,
  setTrimDensity,
} from '../../../state/slices/viewSlice';

/** Keyed action creators, dispatched by the caller — not pure state setters (Task 3). */
export const RAYMARCH_SETTERS: {
  readonly [K in RaymarchSliderKey]: (value: number) => PayloadAction<number>;
} = {
  opticalThickness: setOpticalThickness,
  sampleWeight: setSampleWeight,
  trimDensity: setTrimDensity,
  stepVoxels: setStepVoxels,
};
