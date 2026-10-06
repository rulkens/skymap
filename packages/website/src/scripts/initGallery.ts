/*
 * initGallery — a band of several views (PictureBand with `views`). Every
 * `data-views` element inside it holds one child per view in the same order,
 * all rendered by the server; this only marks which one is current
 * (`data-here`), and site.css shows it. The markers (`data-go`) choose a view.
 * Left alone the band moves on by itself, slowly, and stops for good once the
 * reader has chosen.
 */
import { wrapIndex } from '../utils/wrapIndex';

// Long enough to read a label through before its picture goes.
const REST_SEC = 9;
const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function initGallery(root: HTMLElement): void {
  // A component's own script is rendered beside its first use, so a stack's children are not all views.
  const stacks = [...root.querySelectorAll('[data-views]')].map((stack) =>
    [...stack.children].filter((child) => !child.matches('script, style')),
  );
  const marks = [...root.querySelectorAll<HTMLButtonElement>('[data-go]')];
  const count = marks.length;
  if (count < 2) return;
  const live = root.querySelector<HTMLElement>('[aria-live]');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const pictures = (view: number): HTMLImageElement[] =>
    stacks.flatMap((stack) => [...(stack[view]?.querySelectorAll('img') ?? [])]);
  let at = 0;
  let chosen = false;
  let rested = 0;

  // The later pictures are kept out of the first load (PictureBand); from here on the browser may fetch them.
  const warm = (): void => {
    if (root.hasAttribute('data-warm')) return;
    root.setAttribute('data-warm', '');
    for (let view = 1; view < count; view++)
      for (const img of pictures(view)) img.loading = 'eager';
  };

  const show = (view: number, byReader: boolean): void => {
    at = wrapIndex(view, count);
    warm();
    // A change nobody asked for is not read out: a label announced every few seconds talks over the page.
    live?.setAttribute('aria-live', byReader ? 'polite' : 'off');
    for (const stack of stacks)
      stack.forEach((child, i) => child.toggleAttribute('data-here', i === at));
    marks.forEach((mark, i) => {
      mark.setAttribute('aria-pressed', String(i === at));
      mark.tabIndex = i === at ? 0 : -1;
    });
  };

  const choose = (view: number): void => {
    chosen = true;
    show(view, true);
  };

  marks.forEach((mark, i) => {
    mark.addEventListener('click', () => choose(i));
    mark.addEventListener('keydown', (event) => {
      const to =
        event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : at + (STEPS[event.key] ?? 0);
      if (to === at) return;
      event.preventDefault();
      choose(to);
      marks[at]!.focus();
    });
  });

  for (const stack of stacks) stack[0]?.toggleAttribute('data-here', true);
  root.setAttribute('data-live', '');

  root.addEventListener('pointerenter', warm, { once: true });
  root.addEventListener('focusin', warm, { once: true });
  const whenIdle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 2000));
  if (document.readyState === 'complete') whenIdle(warm);
  else window.addEventListener('load', () => whenIdle(warm), { once: true });

  const waiting = (): boolean =>
    document.hidden ||
    root.matches(':hover, :focus-within') ||
    root.getBoundingClientRect().bottom <= 0 ||
    !pictures(wrapIndex(at + 1, count)).every((img) => img.complete && img.naturalWidth > 0);

  // Counted in seconds of rest, so the wait starts again whenever the reader leaves the band alone.
  const clock = setInterval(() => {
    if (chosen || still.matches) return clearInterval(clock);
    rested = waiting() ? 0 : rested + 1;
    if (rested < REST_SEC) return;
    rested = 0;
    show(at + 1, false);
  }, 1000);
}
