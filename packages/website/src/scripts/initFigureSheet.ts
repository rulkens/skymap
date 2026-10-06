/*
 * initFigureSheet — the sheet a docs picture opens in (components/FigureSheet.astro).
 * A picture on the page is a link to its largest file (components/DocFigure.astro),
 * so without this script the browser shows that file. One listener on the page
 * serves every picture; the dialog itself gives Esc, the focus trap and the
 * return of focus.
 */
export function initFigureSheet(sheet: HTMLDialogElement): void {
  const picture = sheet.querySelector('img')!;
  const name = sheet.querySelector<HTMLElement>('[data-figure-name]')!;
  let opener: HTMLAnchorElement | undefined;

  document.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-enlarge]');
    // A modified click is the reader asking for a new tab or a download of the file.
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    opener = link;
    const { enlarge, width, height, fileWidth } = link.dataset;
    name.textContent = enlarge!;
    picture.alt = link.querySelector('img')!.alt;
    picture.width = Number(width);
    picture.height = Number(height);
    picture.style.setProperty('--own', `${width}px`);
    picture.style.setProperty('--file', `${fileWidth}px`);
    picture.style.setProperty('--shape', `${Number(width) / Number(height)}`);
    picture.src = link.href;
    sheet.showModal();
    picture.parentElement!.scrollTo(0, 0);
  });

  // Anywhere but the picture closes: the Close control, the bar and the room around the picture.
  sheet.addEventListener('click', (event) => {
    if (event.target !== picture) sheet.close();
  });

  sheet.addEventListener('close', () => {
    // Otherwise the next picture opens showing this one until its own file has arrived.
    picture.removeAttribute('src');
    // Safari does not focus a link on a click, so it has no focus of its own to give back.
    opener?.focus();
  });
}
