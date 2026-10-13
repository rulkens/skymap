/**
 * One row of the Settings page's table of data sizes: what is loaded, and how
 * much of it at each of the app's three sizes, in the words the page prints.
 */
export type DocsSettingSize = {
  what: string;
  small: string;
  medium: string;
  large: string;
};
