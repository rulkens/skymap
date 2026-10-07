/**
 * One control of the app's Settings panel, as the Settings page prints it.
 * `name` is the label the app shows. `state` is the path of the value in the
 * app's settings (`tier` for the data size) and `firstValue` what the app
 * starts it with, so a test can hold both to the app's own starting state; a
 * switch that only sets the switches under it has neither. `values` and
 * `first` are the same two things in the words and units the panel shows.
 */
export type DocsSetting = {
  name: string;
  control: 'switch' | 'slider' | 'list';
  does: string;
  values: string;
  first: string;
  state?: string;
  firstValue?: boolean | number | string;
};
