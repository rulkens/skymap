/**
 * The sky window's preload: nothing for the page to call. It tells main about an Escape press the page
 * left unused, read once the press has run every handler, since the app's own (palette, popover,
 * splash) mark theirs with preventDefault. It also lays a strip along the top edge that moves the
 * window, shown only while main says the sky is a window (Escape made it one).
 */
import { ipcRenderer } from 'electron';
import { SKY_DRAG_CHANNEL } from '../data/skyDragChannel';
import { SKY_ESCAPE_CHANNEL } from '../data/skyEscapeChannel';
import { SKY_WINDOWED_CHANNEL } from '../data/skyWindowedChannel';

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.repeat) return;
  setTimeout(() => event.defaultPrevented || ipcRenderer.send(SKY_ESCAPE_CHANNEL));
});

// Invisible but for the panels' starlight hairline (tokens.css), so a windowed sky shows where it is
// held. Not -webkit-app-region: once the loading curtain's view has been laid over the window and
// lifted, the region stops taking presses and they fall through to the sky. Main moves the window.
const DRAG_EDGE_CSS = `
#skymap-drag-edge {
  position: fixed;
  inset: 0 0 auto;
  z-index: 2147483647;
  height: 28px;
  cursor: grab;
  background: linear-gradient(90deg, transparent, rgba(120, 180, 255, 0.45) 30%,
    rgba(180, 220, 255, 0.7) 50%, rgba(120, 180, 255, 0.45) 70%, transparent) top / 100% 1px no-repeat;
}
#skymap-drag-edge:active { cursor: grabbing; }
#skymap-drag-edge[hidden] { display: none; }
`;

const edge = document.createElement('div');
edge.id = 'skymap-drag-edge';
let dragging = false;
const end = (): void => {
  if (!dragging) return;
  dragging = false;
  ipcRenderer.send(SKY_DRAG_CHANNEL, false);
};
// Capture listeners on window, added before any page script's, so the sky never sees these presses;
// preventDefault on the press also withholds the mouse events that would follow it.
window.addEventListener(
  'pointerdown',
  (event) => {
    if (event.target !== edge || event.button !== 0) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    edge.setPointerCapture(event.pointerId);
    dragging = true;
    ipcRenderer.send(SKY_DRAG_CHANNEL, true);
  },
  true,
);
for (const type of ['pointermove', 'pointerup', 'pointercancel'] as const) {
  window.addEventListener(
    type,
    (event) => {
      if (!dragging) return;
      event.stopImmediatePropagation();
      if (type !== 'pointermove') end();
    },
    true,
  );
}
// Chromium still sends mousemove during a press whose pointerdown was cancelled.
for (const type of ['mousedown', 'mousemove', 'mouseup', 'click'] as const) {
  window.addEventListener(
    type,
    (event) => (dragging || event.target === edge) && event.stopImmediatePropagation(),
    true,
  );
}
window.addEventListener('blur', end);

// Main says when the sky is a window: the page's resize event does not reliably come after leaving
// simple full screen, which left the strip hidden over a windowed sky.
edge.hidden = true;
ipcRenderer.on(SKY_WINDOWED_CHANNEL, (_event, windowed: unknown) => {
  edge.hidden = windowed !== true;
  if (edge.hidden) end();
});

window.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = DRAG_EDGE_CSS;
  document.head.append(style);
  document.body.append(edge);
});
