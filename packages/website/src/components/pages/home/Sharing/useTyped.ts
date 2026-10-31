/*
 * useTyped — a text that, when it changes, keeps what it shares with the last one and types the rest in, as an
 * address bar fills: Sharing's address. The server and a reader who asked for less motion get it whole at once.
 */
import { useEffect, useRef, useState } from 'react';

import { lessWanted } from '../../../../utils/lessWanted.ts';

// The whole change takes this long, however much of it there is: a reveal's pace (motion skill, ≤ 500 ms).
const TYPE_MS = 450;

export function useTyped(text: string): string {
  const [shown, setShown] = useState(text);
  const last = useRef(text);

  useEffect(() => {
    const from = last.current;
    last.current = text;
    if (from === text) return;
    if (lessWanted().motion) {
      setShown(text);
      return;
    }
    let kept = 0;
    while (kept < from.length && from[kept] === text[kept]) kept++;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const done = Math.min(1, (now - start) / TYPE_MS);
      setShown(text.slice(0, kept + Math.round((text.length - kept) * done)));
      if (done < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return shown;
}
