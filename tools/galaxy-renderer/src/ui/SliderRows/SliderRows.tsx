/**
 * SliderRows — renders a list of already-wired `ParamSlider` rows.
 *
 * A row is a `ParamSliderProps` with `value`/`onChange` ALREADY resolved by
 * the caller: sections patch through five unrelated idioms (top-level
 * `paramsPatched`, nested spreads like `DustCloudSection`'s `patchCloud`,
 * `renderPatched`, `fieldTuningPatched`, category-conditional ones), so a
 * descriptor that owned the wiring would fit one and fight the rest.
 *
 * Renders slider rows only. A non-slider control between two sliders is two
 * `<SliderRows>` with the control as an ordinary JSX sibling between them.
 */
import type { ReactNode } from 'react';
import ParamSlider, { type ParamSliderProps } from '../ParamSlider/ParamSlider';

export type SliderRowsProps = {
  /** Labels double as React keys — they are also the rows' accessible names, so they are unique. */
  readonly rows: readonly ParamSliderProps[];
};

function SliderRows({ rows }: SliderRowsProps): ReactNode {
  return rows.map((row) => <ParamSlider key={row.label} {...row} />);
}

export default SliderRows;
