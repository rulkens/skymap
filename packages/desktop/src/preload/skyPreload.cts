/**
 * The sky window's preload: nothing for the page to call. It tells main about an Escape press the page
 * left unused, read once the press has run every handler, since the app's own (palette, popover,
 * splash) mark theirs with preventDefault.
 */
import { ipcRenderer } from 'electron';
import { SKY_ESCAPE_CHANNEL } from '../data/skyEscapeChannel';

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.repeat) return;
  setTimeout(() => event.defaultPrevented || ipcRenderer.send(SKY_ESCAPE_CHANNEL));
});
