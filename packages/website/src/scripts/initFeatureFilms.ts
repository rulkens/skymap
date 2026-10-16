/*
 * initFeatureFilms — the loops in the discs of the Features page
 * (components/FeatureHead.astro). A film plays while half of its disc is on
 * screen and stops when it leaves; its button stops and starts it. The <video>
 * is made the first time it is to play, so a film never scrolled to is never
 * fetched. A visitor who asked for less motion or less data gets the still
 * with a "Play film" button, and nothing moves until they press it.
 */
export function initFeatureFilms(root: ParentNode): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const calm = connection?.saveData || matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (const host of root.querySelectorAll<HTMLElement>('[data-feature-film]')) {
    const button = host.querySelector('button')!;
    let film: HTMLVideoElement | undefined;
    let wanted = !calm;
    let seen = false;

    const make = (): HTMLVideoElement => {
      const made = document.createElement('video');
      made.muted = true;
      made.loop = true;
      made.playsInline = true;
      made.disableRemotePlayback = true;
      made.tabIndex = -1;
      made.setAttribute('aria-hidden', 'true');
      made.src = host.dataset.src!;
      made.addEventListener('playing', () => host.setAttribute('data-film', ''), { once: true });
      host.querySelector('[data-screen]')!.append(made);
      return made;
    };

    const apply = (): void => {
      button.textContent = wanted ? 'Pause film' : 'Play film';
      if (wanted && seen) {
        film ??= make();
        // Rejected when the film is stopped before it starts; nothing to do about it.
        film.play().catch(() => {});
      } else film?.pause();
    };

    button.hidden = false;
    button.addEventListener('click', () => {
      wanted = !wanted;
      apply();
    });
    new IntersectionObserver(
      ([entry]) => {
        seen = entry!.isIntersecting;
        apply();
      },
      { threshold: 0.5 },
    ).observe(host.querySelector('[data-screen]')!);
    apply();
  }
}
