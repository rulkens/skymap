import type { DocsSetting } from './DocsSetting';

/**
 * One table of the Settings page: the controls under one heading of the app's
 * Settings panel, in the panel's order. `title` is the heading as the panel
 * prints it and `under` the heading it sits inside, if any. `file` is the
 * component, from the repository's root, that draws the group: a test reads
 * the names of its sliders and headings out of it.
 */
export type DocsSettingGroup = {
  id: string;
  title: string;
  under?: string;
  file: string;
  rows: readonly DocsSetting[];
};
