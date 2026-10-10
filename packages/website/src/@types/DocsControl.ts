/**
 * One row of a table on the Controls page. `input` is what the reader does:
 * keys as the `Keys` component takes them, or one phrase for a gesture.
 * `shortcut` holds the names the app's own shortcut table gives those keys
 * (hotkeys-js spelling), so a test can hold the page to that table; a key the
 * app handles elsewhere has none.
 */
export type DocsControl = {
  input: readonly string[];
  shortcut?: readonly string[];
  does: string;
  where: string;
};
