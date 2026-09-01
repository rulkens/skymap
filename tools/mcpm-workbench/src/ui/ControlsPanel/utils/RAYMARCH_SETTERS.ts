import type { RaymarchSliderKey } from '../../../../@types/RaymarchSliderKey';
import type { ViewSlice } from '../../../../@types/ViewSlice';
import {
  setOpticalThickness,
  setSampleWeight,
  setStepVoxels,
  setTrimDensity,
} from '../../../state/slices/viewSlice';

export const RAYMARCH_SETTERS: {
  readonly [K in RaymarchSliderKey]: (prev: ViewSlice, value: number) => ViewSlice;
} = {
  opticalThickness: setOpticalThickness,
  sampleWeight: setSampleWeight,
  trimDensity: setTrimDensity,
  stepVoxels: setStepVoxels,
};
