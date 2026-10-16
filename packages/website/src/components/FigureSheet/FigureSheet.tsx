/*
 * FigureSheet — the sheet a docs picture opens in when it is clicked: the
 * whole window, the picture's name and Close in a bar, and under it the
 * picture as large as the window shows whole. A window narrower than the app
 * drew it shows it at the app's size, starting at its middle, and scrolls;
 * a touch screen may pinch. One per page, filled from the picture clicked:
 * a picture on the page is a link to its largest file (DocFigure), so before
 * this island runs the browser shows that file. One listener on the page
 * serves every `a[data-enlarge]`; the dialog itself gives Esc, the focus trap
 * and the return of focus. It is the search sheet's kind of dialog (DocsSearch).
 */
import { useEffect, useRef } from 'react';

import Icon from '../Icon/Icon.tsx';
import styles from './FigureSheet.module.css';

function FigureSheet() {
  const sheet = useRef<HTMLDialogElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const name = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const dialog = sheet.current!;
    const image = picture.current!;
    let opener: HTMLAnchorElement | undefined;

    const onPageClick = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-enlarge]');
      // A modified click is the reader asking for a new tab or a download of the file.
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      const { enlarge, width, height, fileWidth } = link.dataset;
      name.current!.textContent = enlarge!;
      // "Enlarge" under a figure is the same link without the picture inside it.
      image.alt = link.closest('figure')!.querySelector('img')!.alt;
      image.width = Number(width);
      image.height = Number(height);
      image.style.setProperty('--own', `${width}px`);
      image.style.setProperty('--file', `${fileWidth}px`);
      image.style.setProperty('--shape', `${Number(width) / Number(height)}`);
      image.src = link.href;
      dialog.showModal();
      const room = image.parentElement!;
      dialog.toggleAttribute('data-pan', room.clientWidth < Number(width));
      // A panned picture opens on its middle, where its subject is, not on its top left corner.
      room.scrollTo(
        (room.scrollWidth - room.clientWidth) / 2,
        (room.scrollHeight - room.clientHeight) / 2,
      );
    };

    // Anywhere but the picture closes: the Close control, the bar and the room around the picture.
    const onSheetClick = (event: MouseEvent) => {
      if (event.target !== image) dialog.close();
    };

    const onClose = () => {
      // Otherwise the next picture opens showing this one until its own file has arrived.
      image.removeAttribute('src');
      // Safari does not focus a link on a click, so it has no focus of its own to give back.
      opener?.focus();
    };

    document.addEventListener('click', onPageClick);
    dialog.addEventListener('click', onSheetClick);
    dialog.addEventListener('close', onClose);
    return () => {
      document.removeEventListener('click', onPageClick);
      dialog.removeEventListener('click', onSheetClick);
      dialog.removeEventListener('close', onClose);
    };
  }, []);

  return (
    <dialog ref={sheet} className={styles.root} aria-labelledby="figure-name">
      <div className={styles.bar}>
        <p className={styles.name} id="figure-name">
          <span ref={name} />
          <span className={styles.pan}>Drag to see the rest of it.</span>
        </p>
        <button className={styles.close} type="button">
          <Icon name="close" />
          Close
        </button>
      </div>
      <div className={styles.room}>
        <img ref={picture} alt="" decoding="async" />
      </div>
    </dialog>
  );
}

export default FigureSheet;
