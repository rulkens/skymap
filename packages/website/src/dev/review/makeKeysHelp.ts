import { make } from '../overlay/make';

// Static markup, no page text in it. Keys are <kbd>; mouse actions are plain words.
const HELP = `
<h3>Overlay</h3>
<dl>
  <dt><kbd>F</kbd></dt><dd>Turns the overlay on and off</dd>
  <dt><kbd>Esc</kbd></dt><dd>Cancels</dd>
</dl>
<h3>Notes</h3>
<dl>
  <dt>Click or drag</dt><dd>Leaves a note on the page</dd>
</dl>
<h3>Marks</h3>
<dl>
  <dt><kbd>Shift</kbd> + drag</dt><dd>Selects text</dd>
  <dt><kbd>C</kbd></dt><dd>Cuts the selected text</dd>
  <dt><kbd>W</kbd></dt><dd>Rewrites the selected text</dd>
  <dt><kbd>G</kbd></dt><dd>Marks the selected text good</dd>
  <dt><kbd>M</kbd></dt><dd>Shows the marks in the text</dd>
  <dt>Click a mark</dt><dd>Cycles cut, keep, rewrite, good</dd>
  <dt><kbd>H</kbd></dt><dd>Shows the result</dd>
  <dt>Section icon</dt><dd>Opens that section's review</dd>
</dl>
<h3>Help</h3>
<dl>
  <dt><kbd>?</kbd></dt><dd>Opens and closes this box</dd>
</dl>`;

/** The review's key reference: a box anchored to the bar it is appended to, hidden until opened. */
export function makeKeysHelp(bar: HTMLElement): HTMLElement {
  const box = make('div', 'review-help', bar);
  box.id = 'review-help';
  box.hidden = true;
  box.tabIndex = -1;
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Keys');
  box.innerHTML = HELP;
  return box;
}
