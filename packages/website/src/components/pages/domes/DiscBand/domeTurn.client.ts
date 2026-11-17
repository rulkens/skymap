/*
 * Turns the sky of the domes page's opening disc about the zenith, under a pointer or the arrow keys, as a
 * dome turns under the sky. The disc's centre is the zenith, so a turn of the picture about it is a turn of
 * the sky about the vertical; the marks drawn over it stay. Without script the disc is a still picture.
 */
const STEP_DEG = 5;

for (const disc of document.querySelectorAll<HTMLElement>('[data-dome-turn]')) {
  let turn = 0;
  let grab: number | undefined;
  const set = (deg: number) => {
    turn = ((Math.round(deg) % 360) + 360) % 360;
    disc.style.setProperty('--sky-turn', `${turn}deg`);
    disc.ariaValueNow = String(turn);
  };
  const angleAt = (event: PointerEvent) => {
    const box = disc.getBoundingClientRect();
    const x = event.clientX - box.left - box.width / 2;
    const y = event.clientY - box.top - box.height / 2;
    return (Math.atan2(y, x) * 180) / Math.PI;
  };

  disc.addEventListener('pointerdown', (event) => {
    disc.setPointerCapture(event.pointerId);
    grab = angleAt(event) - turn;
  });
  disc.addEventListener('pointermove', (event) => {
    if (grab !== undefined) set(angleAt(event) - grab);
  });
  // A mouse drag on the picture is otherwise the browser's own image drag, which takes the pointer away.
  disc.addEventListener('dragstart', (event) => event.preventDefault());
  for (const end of ['pointerup', 'pointercancel'] as const)
    disc.addEventListener(end, () => (grab = undefined));
  disc.addEventListener('keydown', (event) => {
    const by = { ArrowLeft: -STEP_DEG, ArrowRight: STEP_DEG }[event.key];
    if (by === undefined) return;
    event.preventDefault();
    set(turn + by);
  });

  // A control only once it works: without script the disc is not focusable.
  Object.assign(disc, { tabIndex: 0, role: 'slider', ariaLabel: 'Turn the sky about the zenith' });
  Object.assign(disc, { ariaValueMin: '0', ariaValueMax: '359', ariaValueNow: '0' });
  disc.dataset.turnReady = '';
  document.querySelector<HTMLElement>('[data-turn-hint]')?.removeAttribute('hidden');
}
