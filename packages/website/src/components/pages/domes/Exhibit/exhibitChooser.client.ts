/*
 * The domes page's exhibit list: pointing at an exhibit's name, or reaching it with Tab, shows that exhibit's
 * screen and label in the picture beside it. The name stays a link into the app, so a click or a tap opens it.
 */
for (const section of document.querySelectorAll<HTMLElement>('[data-exhibits]')) {
  const links = [...section.querySelectorAll<HTMLAnchorElement>('a[data-exhibit]')];
  const parts = [...section.querySelectorAll<HTMLElement>('figure [data-exhibit]')];
  const show = (shot: string) => {
    for (const part of parts) {
      const on = part.dataset.exhibit === shot;
      part.toggleAttribute('data-shown', on);
      part.toggleAttribute('aria-hidden', !on);
    }
    for (const link of links) {
      if (link.dataset.exhibit === shot) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };
  for (const link of links) {
    link.addEventListener('pointerenter', () => show(link.dataset.exhibit!));
    link.addEventListener('focus', () => show(link.dataset.exhibit!));
  }
}
