/**
 * The sky window's preload: nothing for the page to call. It tells main about an Escape press the page
 * left unused, read once the press has run every handler, since the app's own (palette, popover,
 * splash) mark theirs with preventDefault. While main says the sky is a window (Escape made it one),
 * a press on bare sky along the top edge moves the window; the page's own controls there keep theirs.
 */
import { ipcRenderer } from 'electron';
import { SKY_DRAG_CHANNEL } from '../data/skyDragChannel';
import { SKY_ESCAPE_CHANNEL } from '../data/skyEscapeChannel';
import { SKY_WINDOWED_CHANNEL } from '../data/skyWindowedChannel';

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.repeat) return;
  setTimeout(() => event.defaultPrevented || ipcRenderer.send(SKY_ESCAPE_CHANNEL));
});

// The band a press moves the window from, as tall as the title bar the window buttons sit in.
const EDGE_PX = 28;
// What the page uses as a control: a press on one of these is the page's, even inside the band.
const CONTROL =
  'a, button, input, select, textarea, label, summary, [contenteditable="true"], [role="button"], ' +
  '[role="link"], [role="search"], [role="searchbox"], [role="textbox"], [role="slider"], ' +
  '[role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
// The strip itself is only a picture, the panels' starlight hairline (tokens.css), and takes no
// presses: the band is read from where a press lands. Not -webkit-app-region: once the loading
// curtain's view has been laid over the window and lifted, the region stops taking presses.
const DRAG_EDGE_CSS = `
#skymap-drag-edge {
  position: fixed;
  inset: 0 0 auto;
  z-index: 2147483647;
  height: 1px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(120, 180, 255, 0.45) 30%,
    rgba(180, 220, 255, 0.7) 50%, rgba(120, 180, 255, 0.45) 70%, transparent);
}
#skymap-drag-edge[hidden] { display: none; }
html.skymap-grab, html.skymap-grab * { cursor: grab !important; }
html.skymap-grabbing, html.skymap-grabbing * { cursor: grabbing !important; }
`;

const edge = document.createElement('div');
edge.id = 'skymap-drag-edge';
edge.hidden = true;
let dragging = false;
const inBand = (event: MouseEvent): boolean =>
  !edge.hidden &&
  event.clientY < EDGE_PX &&
  !(event.target instanceof Element && event.target.closest(CONTROL));
const end = (): void => {
  if (!dragging) return;
  dragging = false;
  moved = true;
  // Only the click this press makes; a later one is the sky's again.
  setTimeout(() => (moved = false), 300);
  document.documentElement.classList.remove('skymap-grabbing');
  ipcRenderer.send(SKY_DRAG_CHANNEL, false);
};

// Capture listeners on window, added before any page script's, so the sky never sees these presses;
// preventDefault on the press also withholds the mouse events that would follow it.
window.addEventListener(
  'pointerdown',
  (event) => {
    if (event.button !== 0 || !inBand(event)) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    document.documentElement.setPointerCapture(event.pointerId);
    document.documentElement.classList.add('skymap-grabbing');
    dragging = true;
    ipcRenderer.send(SKY_DRAG_CHANNEL, true);
  },
  true,
);
window.addEventListener(
  'pointermove',
  (event) => {
    if (dragging) return event.stopImmediatePropagation();
    document.documentElement.classList.toggle('skymap-grab', inBand(event));
  },
  true,
);
for (const type of ['pointerup', 'pointercancel'] as const) {
  window.addEventListener(
    type,
    (event) => {
      if (!dragging) return;
      event.stopImmediatePropagation();
      end();
    },
    true,
  );
}
// Chromium still sends mousemove during a press whose pointerdown was cancelled, and a click after
// it, which would pick whatever the sky shows under the cursor.
let moved = false;
for (const type of ['mousemove', 'mouseup'] as const) {
  window.addEventListener(type, (event) => dragging && event.stopImmediatePropagation(), true);
}
window.addEventListener(
  'click',
  (event) => {
    if (!moved) return;
    moved = false;
    event.stopImmediatePropagation();
  },
  true,
);
window.addEventListener('blur', end);

// Main says when the sky is a window: the page's resize event does not reliably come after leaving
// simple full screen, which left the strip hidden over a windowed sky.
ipcRenderer.on(SKY_WINDOWED_CHANNEL, (_event, windowed: unknown) => {
  edge.hidden = windowed !== true;
  if (edge.hidden) {
    end();
    document.documentElement.classList.remove('skymap-grab');
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = DRAG_EDGE_CSS;
  document.head.append(style);
  document.body.append(edge);
});
