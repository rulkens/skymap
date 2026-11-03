export const SHOWN = 8;
export const NO_INDEX = import.meta.env.DEV
  ? 'Search reads an index that is cut when the site is built. This is the development server, which has none.'
  : 'The search index did not load. Reload the page to try again.';
