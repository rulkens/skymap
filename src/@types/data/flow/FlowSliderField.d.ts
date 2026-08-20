import type { SliderField } from '../SliderField';
import type { FlowSliderKey } from './FlowSliderKey';
import type { FlowSliderSurface } from './FlowSliderSurface';

/** UI metadata for one numeric flow-overlay slider, iterated by both panels. */
export type FlowSliderField = SliderField<FlowSliderKey> & { surface: FlowSliderSurface };
