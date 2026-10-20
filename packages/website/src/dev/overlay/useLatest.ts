import { useEffect, useRef, type RefObject } from 'react';

/** A ref that holds the value of the latest render, for a listener that is registered once and must not go stale. */
export function useLatest<T>(value: T): RefObject<T> {
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  return latest;
}
