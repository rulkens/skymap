/*
 * Moves FrameCompare's divider: a press or a sideways drag anywhere on the frame puts it under the pointer, and
 * the handle is a slider for the keys (arrows by 5%, Home and End). A touch that starts as a vertical swipe
 * scrolls the page (`touch-action: pan-y`), so the browser cancels the pointer before the divider moves.
 */
const STEP = 5;

for (const frame of document.querySelectorAll<HTMLElement>('[data-compare]')) {
  const handle = frame.querySelector<HTMLElement>('[data-compare-handle]')!;
  let split = 50;
  // The frame's box, read once per press, so a drag only writes.
  let box: DOMRect | undefined;
  // Where a touch went down, until it first moves more sideways than up or down.
  let touchStart: { x: number; y: number } | undefined;
  const set = (percent: number) => {
    split = Math.min(100, Math.max(0, Math.round(percent)));
    frame.style.setProperty('--split', `${split}%`);
    handle.ariaValueNow = String(split);
  };
  const follow = (event: PointerEvent) => {
    if (box) set(((event.clientX - box.left) / box.width) * 100);
  };
  const release = () => {
    box = undefined;
    touchStart = undefined;
  };

  frame.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    frame.setPointerCapture(event.pointerId);
    box = frame.getBoundingClientRect();
    // The first moves of a scroll still arrive before the browser takes it over, so a touch waits for a sideways one.
    if (event.pointerType === 'touch') touchStart = { x: event.clientX, y: event.clientY };
    else follow(event);
  });
  frame.addEventListener('pointermove', (event) => {
    if (touchStart) {
      const sideways =
        Math.abs(event.clientX - touchStart.x) > Math.abs(event.clientY - touchStart.y);
      if (!sideways) return;
      touchStart = undefined;
    }
    follow(event);
  });
  frame.addEventListener('pointerup', (event) => {
    follow(event);
    release();
  });
  frame.addEventListener('pointercancel', release);
  // A mouse drag on a picture is otherwise the browser's own image drag, which takes the pointer away.
  frame.addEventListener('dragstart', (event) => event.preventDefault());

  handle.addEventListener('keydown', (event) => {
    const to = {
      ArrowLeft: split - STEP,
      ArrowDown: split - STEP,
      ArrowRight: split + STEP,
      ArrowUp: split + STEP,
      Home: 0,
      End: 100,
    }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    set(to);
  });

  // A control only once it works: without script the divider is a still line.
  Object.assign(handle, { tabIndex: 0, role: 'slider', ariaLabel: handle.dataset.compareHandle });
  Object.assign(handle, { ariaValueMin: '0', ariaValueMax: '100', ariaOrientation: 'horizontal' });
  set(split);
  frame.dataset.compareReady = '';
}
