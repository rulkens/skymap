/*
 * The one listener that makes every CopyButton on the page work, imported by
 * layouts/Base.astro's script, once per page. A click on a button that
 * carries `data-copy` puts that text on the clipboard and sets the button's
 * tick (`data-copied`) for two seconds. No clipboard on plain http, and a
 * permission can be refused: then the button stays as it was.
 */
const TICK_MS = 2000;

const reverts = new WeakMap<Element, ReturnType<typeof setTimeout>>();

document.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-copy]');
  if (!button) return;
  void navigator.clipboard?.writeText(button.dataset.copy!).then(
    () => {
      button.setAttribute('data-copied', '');
      button.setAttribute('aria-label', 'Copied');
      clearTimeout(reverts.get(button));
      reverts.set(
        button,
        setTimeout(() => {
          button.removeAttribute('data-copied');
          button.setAttribute('aria-label', button.title);
        }, TICK_MS),
      );
    },
    () => {},
  );
});
