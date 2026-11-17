/**
 * ControlSky — the website's naked-eye star field behind the window, still, with the stars thinned
 * round words and controls as the site does. Boxes are measured when the page changes or scrolls,
 * never per frame. The field is inlined as a data URL: the page runs from file://, where fetch of a
 * file is refused. Decoration only: without it the window is its plain black.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import fieldUrl from '../../../../../../website/src/assets/starField.bin?url&inline';
import { decodeStarField } from '../../../../../../website/src/utils/decodeStarField';
import { CONTROL_SKY } from '../../data/controlSky';
import { drawStarField } from '../../utils/drawStarField';
import { starSprite } from '../../utils/starSprite';
import styles from './ControlSky.module.css';

function ControlSky(): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    let frame = 0;
    const stop = new AbortController();
    void fetch(fieldUrl, { signal: stop.signal })
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        const field = decodeStarField(buffer);
        const sprites = field.palette.map(starSprite);
        const draw = (): void => {
          frame = 0;
          const { innerWidth: width, innerHeight: height } = window;
          const dpr = Math.min(devicePixelRatio, 2);
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          const boxes: number[] = [];
          for (const el of document.querySelectorAll(CONTROL_SKY.cleared)) {
            if (el === canvas || el.parentElement?.closest(CONTROL_SKY.cleared)) continue;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) boxes.push(r.left, r.top, r.right, r.bottom);
          }
          drawStarField(g, field, sprites, width, height, boxes);
          canvas.dataset.shown = '';
        };
        const queue = (): void => {
          if (frame === 0) frame = requestAnimationFrame(draw);
        };
        const observer = new MutationObserver(queue);
        observer.observe(document.body, { childList: true, subtree: true });
        const resized = new ResizeObserver(queue);
        resized.observe(document.body);
        addEventListener('scroll', queue, { capture: true, passive: true, signal: stop.signal });
        addEventListener('resize', queue, { signal: stop.signal });
        void document.fonts.ready.then(queue);
        stop.signal.addEventListener('abort', () => {
          observer.disconnect();
          resized.disconnect();
          cancelAnimationFrame(frame);
        });
        queue();
      })
      .catch(() => {});
    return () => stop.abort();
  }, []);
  return <canvas ref={canvasRef} className={styles.root} aria-hidden="true" />;
}

export default ControlSky;
