/**
 * useFoldUnmount — mounts a section body when `open` turns on and unmounts it only once its
 * fold-up has run, so the sections below slide both ways. Unmounting matters: the probe and the
 * per-frame Stats and Histogram rely on a folded body being gone. `closing` is the stretch in
 * between, while the body is still mounted.
 */
import { useLayoutEffect, useState, type RefObject } from 'react';

export function useFoldUnmount(
  open: boolean,
  bodyRef: RefObject<HTMLElement | null>,
): readonly [mounted: boolean, closing: boolean] {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const closing = mounted && !open;

  // With nothing running (reduced motion, or a DOM without getAnimations) it unmounts at once.
  // A fold mid-grow plays the grow backwards, since the transition cannot start under it.
  // Unfolding mid-way cancels the transitions (`finished` rejects) and turns a reversed grow
  // forward again.
  useLayoutEffect(() => {
    if (!closing) return;
    const running = bodyRef.current?.getAnimations?.() ?? [];
    const grows = running.filter((a) => 'animationName' in a);
    for (const grow of grows) grow.reverse();
    Promise.all(running.map((a) => a.finished)).then(
      () => setMounted(false),
      () => {},
    );
    return () => {
      for (const grow of grows) if (grow.playState === 'running') grow.reverse();
    };
  }, [closing, bodyRef]);

  return [mounted, closing];
}
