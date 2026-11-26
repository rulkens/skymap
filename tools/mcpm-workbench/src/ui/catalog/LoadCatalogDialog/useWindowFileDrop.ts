import { useEffect, useEffectEvent } from 'react';

/** useWindowFileDrop — files dropped anywhere on the page, for as long as the caller is mounted. */
export function useWindowFileDrop(onFiles: (files: File[]) => void): void {
  const onDrop = useEffectEvent((e: DragEvent): void => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length > 0) onFiles(dropped);
  });

  useEffect(() => {
    const allowDrop = (e: DragEvent): void => e.preventDefault();
    window.addEventListener('dragover', allowDrop);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', allowDrop);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}
