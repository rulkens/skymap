import { useEffect } from 'react';

import { useLatest } from './useLatest';

/** Listens on `target` for as long as the component is mounted; the handler may read this render's state. */
export function useListener<K extends keyof DocumentEventMap>(
  target: EventTarget,
  type: K,
  handler: (e: DocumentEventMap[K]) => void,
  capture = false,
): void {
  const latest = useLatest(handler);
  useEffect(() => {
    const listener = (e: Event) => latest.current(e as DocumentEventMap[K]);
    target.addEventListener(type, listener, capture);
    return () => target.removeEventListener(type, listener, capture);
  }, [target, type, capture, latest]);
}
