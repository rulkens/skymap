/*
 * Lights one part of an AnnotatedShot: its box on the picture, its line of the list and, narrower, the line under
 * the picture. A mouse lights a part while it points at its box or its line; a tap or the keyboard's focus keeps
 * one lit until a tap lands off the marks, focus leaves them or Escape is pressed. Touch fires pointerenter too,
 * so only a pointer that can hover counts as pointing.
 */
for (const root of document.querySelectorAll<HTMLElement>('[data-annotated]')) {
  const spots = [...root.querySelectorAll<HTMLAnchorElement>('[data-spot]')];
  const parts = [...root.querySelectorAll<HTMLElement>('[data-part]')];
  const readout = root.querySelector<HTMLElement>('[data-readout]')!;
  const readName = readout.querySelector('strong')!;
  const readDoes = readout.querySelector('span')!;
  const hint = readDoes.textContent;
  let held = -1;
  let pointed = -1;

  const show = () => {
    const lit = pointed >= 0 ? pointed : held;
    spots.forEach((spot, i) => spot.toggleAttribute('data-lit', i === lit));
    parts.forEach((part, i) => part.toggleAttribute('data-lit', i === lit));
    const part = parts[lit];
    readout.toggleAttribute('data-lit', part !== undefined);
    readout.dataset.n = part?.dataset.n ?? '';
    readName.textContent = part?.querySelector('strong')!.textContent ?? '';
    readDoes.textContent = part?.querySelector('span')!.textContent ?? hint;
  };
  const point = (i: number) => (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    pointed = i;
    show();
  };
  const unpoint = () => {
    pointed = -1;
    show();
  };
  const hold = (i: number) => {
    held = i;
    show();
  };

  for (const [i, el] of [...spots, ...parts].entries()) {
    el.addEventListener('pointerenter', point(i % spots.length));
    el.addEventListener('pointerleave', unpoint);
  }
  for (const [i, spot] of spots.entries()) {
    spot.addEventListener('click', (event) => {
      event.preventDefault();
      hold(i);
    });
    spot.addEventListener('focus', () => hold(i));
    spot.addEventListener('blur', (event) => {
      if (!spots.includes(event.relatedTarget as HTMLAnchorElement)) hold(-1);
    });
  }
  document.addEventListener('pointerdown', (event) => {
    const on = event.target instanceof Element && event.target.closest('[data-spot], [data-readout]');
    if (!on) hold(-1);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || (held < 0 && pointed < 0)) return;
    held = -1;
    pointed = -1;
    show();
  });
  readout.hidden = false;
}
