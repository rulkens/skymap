/*
 * initFeedback — dev-only: pick an element or drag a rectangle on any page, type a
 * note, and the dev server writes it to disk for the coding agent (tools/site/feedbackPlugin.ts).
 * No crop image is saved: html2canvas-style capture cannot see <video> or WebGL and
 * would add a dependency; the note's rectangle, scroll and flight time are enough to re-shoot.
 */
import type { FeedbackNote } from '../../../../../tools/site/@types/FeedbackNote';
import type { FeedbackFlight } from '../../../../../tools/site/@types/FeedbackFlight';
import type { FeedbackRect } from '../../../../../tools/site/@types/FeedbackRect';
import type { FlightTimeline } from '../../@types/FlightTimeline';
import { flightAt } from '../../utils/flightAt';
import type { FeedbackPin } from './@types/FeedbackPin';
import type { FeedbackSelection } from './@types/FeedbackSelection';
import { describeElement } from './describeElement';
import './feedback.css';

const ROUTE = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}__feedback`;
const STORE_KEY = `dev-feedback:${location.pathname}`;
// Pixels the pointer must travel before a press becomes a drawn rectangle, not a click.
const DRAG_PX = 6;
const PANEL_GAP = 12;
const VIEW_MARGIN = 8;

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: Element,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent?.append(node);
  return node;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function loadPins(): FeedbackPin[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '[]') as FeedbackPin[];
  } catch {
    return [];
  }
}

// The flight's progress is read the way initFlight reads it, so a note says where in the film it was.
function flightState(): FeedbackFlight | null {
  const flight = document.querySelector<HTMLElement>('[data-flight]');
  const track = flight?.querySelector<HTMLElement>('.track');
  if (!flight?.dataset.timeline || !track) return null;
  const timeline = JSON.parse(flight.dataset.timeline) as FlightTimeline;
  const progress = clamp(
    -track.getBoundingClientRect().top / (track.offsetHeight - innerHeight),
    0,
    1,
  );
  return {
    progress: Number(progress.toFixed(4)),
    filmSec: Number(flightAt(timeline, progress).sec.toFixed(3)),
  };
}

function initFeedback(): void {
  let pins = loadPins();
  let on = false;
  let selection: FeedbackSelection | null = null;
  let press: { x: number; y: number; id: number; moved: boolean; drawing: boolean } | null = null;
  let pointer: { x: number; y: number } | null = null;

  const root = make('div', 'fb-root');
  root.dataset.feedbackUi = '';
  const capture = make('div', 'fb-capture', root);
  const hover = make('div', 'fb-hover', root);
  const hoverLabel = make('span', 'fb-hover-label', hover);
  const mark = make('div', 'fb-mark', root);
  const panel = make('form', 'fb-panel', root);
  const dock = make('div', 'fb-dock', root);
  const list = make('section', 'fb-list', dock);
  const toggle = make('button', 'ring small', dock);
  const layer = make('div', 'fb-pins');
  const text = make('textarea', '', panel);
  const status = make('p', 'fb-status', panel);
  const actions = make('div', 'fb-actions', panel);
  const save = make('button', 'ring small', actions);
  const cancel = make('button', 'ring small', actions);
  make('p', 'fb-hint', actions).textContent = '⌘/Ctrl+Enter saves, Esc cancels';

  toggle.type = 'button';
  toggle.textContent = 'Feedback';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.title = 'Feedback mode (F)';
  list.setAttribute('aria-label', 'Feedback notes on this page');
  status.setAttribute('role', 'status');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Feedback note');
  text.setAttribute('aria-label', 'Your feedback on the selected area');
  text.placeholder = 'What should change here?';
  save.type = 'submit';
  save.textContent = 'Save';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  capture.hidden = hover.hidden = mark.hidden = panel.hidden = list.hidden = layer.hidden = true;
  document.body.append(root);
  document.documentElement.append(layer);

  const isOverlay = (node: Element): boolean => !!node.closest('[data-feedback-ui], .fb-pins');
  const pick = (x: number, y: number): Element =>
    document.elementsFromPoint(x, y).find((node) => !isOverlay(node)) ?? document.body;
  const place = (box: HTMLElement, r: FeedbackRect): void => {
    box.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px`;
  };
  const viewRect = (r: FeedbackRect): FeedbackRect => ({
    ...r,
    x: r.x - scrollX,
    y: r.y - scrollY,
  });
  const pageRect = (r: DOMRect | FeedbackRect): FeedbackRect => ({
    x: Math.round(r.x + scrollX),
    y: Math.round(r.y + scrollY),
    width: Math.round(r.width),
    height: Math.round(r.height),
  });

  function layout(): void {
    if (!selection) return;
    const r = viewRect(selection.rect);
    place(mark, r);
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    let x = r.x + r.width + PANEL_GAP;
    let y = r.y;
    if (x + w > innerWidth - VIEW_MARGIN) x = r.x - w - PANEL_GAP;
    if (x < VIEW_MARGIN) {
      // Neither side has room (a phone, or a wide element): go under the area, else above it.
      x = r.x;
      y = r.y + r.height + PANEL_GAP;
      if (y + h > innerHeight - VIEW_MARGIN) y = r.y - h - PANEL_GAP;
    }
    panel.style.left = `${clamp(x, VIEW_MARGIN, Math.max(VIEW_MARGIN, innerWidth - w - VIEW_MARGIN))}px`;
    panel.style.top = `${clamp(y, VIEW_MARGIN, Math.max(VIEW_MARGIN, innerHeight - h - VIEW_MARGIN))}px`;
  }

  function showHover(): void {
    if (!on || selection || press?.drawing || !pointer) return void (hover.hidden = true);
    const r = pick(pointer.x, pointer.y);
    const box = r.getBoundingClientRect();
    hover.hidden = false;
    place(hover, box);
    hover.classList.toggle('below', box.top < 24);
    hoverLabel.textContent = `${r.localName}${[...r.classList]
      .slice(0, 2)
      .map((c) => `.${c}`)
      .join('')}`;
  }

  function renderPins(): void {
    layer.replaceChildren();
    list.replaceChildren();
    const items = make('ol', '', list);
    for (const pin of pins) {
      const box = make('div', 'fb-pin', layer);
      place(box, pin.rect);
      const dot = make('span', 'fb-dot', box);
      dot.textContent = String(pin.n);
      dot.title = pin.text;
      const row = make('li', '', items);
      make('span', 'n', row).textContent = String(pin.n);
      make('span', 't', row).textContent = pin.text.split('\n')[0]!;
      const del = make('button', 'ring small', row);
      del.type = 'button';
      del.textContent = 'Delete';
      del.setAttribute('aria-label', `Delete note ${pin.n}`);
      del.addEventListener('click', () => void remove(pin));
    }
    list.hidden = !on || pins.length === 0;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(pins));
    } catch {
      /* private window: the pins just do not survive a reload */
    }
  }

  // A note the agent has applied is deleted on the server; its pin goes with it.
  async function prune(): Promise<void> {
    try {
      const { ids } = (await (await fetch(ROUTE)).json()) as { ids: string[] };
      if (pins.every((pin) => ids.includes(pin.id))) return;
      pins = pins.filter((pin) => ids.includes(pin.id));
      renderPins();
    } catch {
      /* server restarting: keep the pins, the next focus tries again */
    }
  }
  window.addEventListener('focus', () => void prune());
  void prune();

  function setMode(next: boolean): void {
    on = next;
    toggle.setAttribute('aria-pressed', String(on));
    capture.hidden = layer.hidden = !on;
    if (!on) endSelection();
    renderPins();
    showHover();
  }

  function endSelection(): void {
    selection = null;
    panel.hidden = mark.hidden = true;
    status.textContent = '';
  }

  function choose(next: FeedbackSelection): void {
    selection = next;
    hover.hidden = true;
    mark.hidden = panel.hidden = false;
    text.value = '';
    status.textContent = '';
    layout();
    text.focus();
  }

  async function send(): Promise<void> {
    if (!selection || !text.value.trim()) return void (status.textContent = 'Write a note first.');
    const { rect, element, kind } = selection;
    const note: FeedbackNote = {
      text: text.value.trim(),
      timestamp: new Date().toISOString(),
      page: { url: location.href, path: location.pathname, title: document.title },
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
      flight: flightState(),
      selection: kind,
      rect: { page: rect, viewport: viewRect(rect) },
      element: describeElement(element),
      userAgent: navigator.userAgent,
    };
    save.disabled = true;
    status.classList.remove('error');
    try {
      const res = await fetch(ROUTE, { method: 'POST', body: JSON.stringify(note) });
      if (!res.ok) throw new Error(`the server said ${res.status}`);
      const { id } = (await res.json()) as { id: string };
      pins.push({ id, n: Math.max(0, ...pins.map((p) => p.n)) + 1, text: note.text, rect });
      endSelection();
      renderPins();
      toggle.focus();
    } catch (error) {
      status.classList.add('error');
      status.textContent = `Not saved: ${error instanceof Error ? error.message : error}`;
    } finally {
      save.disabled = false;
    }
  }

  async function remove(pin: FeedbackPin): Promise<void> {
    try {
      const res = await fetch(`${ROUTE}?id=${encodeURIComponent(pin.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`the server said ${res.status}`);
      pins = pins.filter((p) => p !== pin);
      renderPins();
    } catch (error) {
      console.error('feedback: delete failed', error);
    }
  }

  capture.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (selection) return text.focus();
    press = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, drawing: false };
  });
  capture.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    if (press?.id === e.pointerId) {
      const far = Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_PX;
      press.moved ||= far;
      // A finger drag is the page scrolling; only a mouse or pen draws.
      if (far && e.pointerType !== 'touch' && !press.drawing) {
        press.drawing = true;
        capture.setPointerCapture(e.pointerId);
        mark.hidden = false;
      }
      if (press.drawing) {
        place(mark, {
          x: Math.min(press.x, e.clientX),
          y: Math.min(press.y, e.clientY),
          width: Math.abs(e.clientX - press.x),
          height: Math.abs(e.clientY - press.y),
        });
      }
    }
    showHover();
  });
  capture.addEventListener('pointerup', (e) => {
    const done = press;
    press = null;
    if (!done || done.id !== e.pointerId) return;
    if (done.drawing) {
      const r = mark.getBoundingClientRect();
      return choose({
        kind: 'rectangle',
        rect: pageRect(r),
        element: pick(r.x + r.width / 2, r.y + r.height / 2),
      });
    }
    if (done.moved) return;
    const element = pick(e.clientX, e.clientY);
    choose({ kind: 'element', rect: pageRect(element.getBoundingClientRect()), element });
  });
  capture.addEventListener('pointercancel', () => {
    press = null;
    mark.hidden = true;
  });
  capture.addEventListener('pointerleave', () => {
    pointer = null;
    showHover();
  });
  // The page moves under a still pointer when it scrolls, so the outline follows.
  addEventListener(
    'scroll',
    () => {
      layout();
      showHover();
    },
    { passive: true },
  );
  addEventListener('resize', layout);

  panel.addEventListener('submit', (e) => {
    e.preventDefault();
    void send();
  });
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  });
  cancel.addEventListener('click', () => {
    endSelection();
    toggle.focus();
  });
  toggle.addEventListener('click', () => setMode(!on));
  document.addEventListener(
    'keydown',
    (e) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, select, [contenteditable]');
      if (e.key === 'Escape' && on) {
        e.preventDefault();
        if (selection) {
          endSelection();
          toggle.focus();
        } else setMode(false);
      } else if (e.key.toLowerCase() === 'f' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setMode(!on);
      }
    },
    true,
  );
  renderPins();
}

initFeedback();
