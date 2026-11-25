/**
 * For a Slider whose pill shows another quantity than the value it stores (degrees
 * for lens stops, 10^v for a log10 track): the typed box reads and writes the shown one.
 */
export type SliderDisplayed = {
  fromValue: (value: number) => number;
  toValue: (displayed: number) => number;
};
