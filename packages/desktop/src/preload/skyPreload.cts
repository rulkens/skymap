/**
 * The sky window's preload: nothing for the page to call. It tells main about an Escape press the page
 * left unused, read once the press has run every handler, since the app's own (palette, popover,
 * splash) mark theirs with preventDefault. It also lays a strip along the top edge that drags the
 * frameless window, shown only while the window is smaller than its screen (Escape made it a window).
 */
import { ipcRenderer } from 'electron';
import { SKY_ESCAPE_CHANNEL } from '../data/skyEscapeChannel';

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.repeat) return;
  setTimeout(() => event.defaultPrevented || ipcRenderer.send(SKY_ESCAPE_CHANNEL));
});

// Invisible but for the panels' starlight hairline (tokens.css), so a windowed sky shows where it is
// held. A drag region swallows the clicks it covers, hence hidden while the sky fills its screen.
const DRAG_EDGE_CSS = `
#skymap-drag-edge {
  position: fixed;
  inset: 0 0 auto;
  z-index: 2147483647;
  height: 16px;
  -webkit-app-region: drag;
  background: linear-gradient(90deg, transparent, rgba(120, 180, 255, 0.45) 30%,
    rgba(180, 220, 255, 0.7) 50%, rgba(120, 180, 255, 0.45) 70%, transparent) top / 100% 1px no-repeat;
}
#skymap-drag-edge[hidden] { display: none; }
`;

window.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = DRAG_EDGE_CSS;
  const edge = document.createElement('div');
  edge.id = 'skymap-drag-edge';
  const fit = () => {
    edge.hidden = outerWidth >= screen.width && outerHeight >= screen.height;
  };
  fit();
  window.addEventListener('resize', fit);
  document.head.append(style);
  document.body.append(edge);
});
