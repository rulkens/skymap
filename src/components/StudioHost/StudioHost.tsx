import { lazy, Suspense, type ComponentType } from 'react';
import { useAppSelector } from '../../store/hooks';
import { selectTakeoverSource } from '../../state/takeover/selectors';
import type { ClipId } from '../../@types/animation/ClipId';

// The studio is its own chunk (packages/studio README, A2): fetched only when a `#studio=` link opens it.
const StudioDock = lazy(
  (): Promise<{ default: ComponentType<{ clipId: ClipId }> }> =>
    import('../../../packages/studio/src/studioEntry')
      .then((m) => ({ default: m.StudioDock }))
      // A failed fetch (the saga ends the takeover too) must not throw into React and unmount the app.
      .catch(() => ({ default: () => null })),
);

/** Mounts the clip studio's dock while the `#studio=<clipId>` takeover is up. */
function StudioHost() {
  const source = useAppSelector(selectTakeoverSource);
  if (source?.kind !== 'studio') return null;
  return (
    <Suspense fallback={null}>
      <StudioDock clipId={source.id} />
    </Suspense>
  );
}

export default StudioHost;
