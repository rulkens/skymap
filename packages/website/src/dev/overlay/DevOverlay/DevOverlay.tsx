/*
 * DevOverlay — the dev-only overlay's island. Base.astro mounts it as `client:only` under
 * `import.meta.env.DEV`, but Astro still emits the chunk of a client:only component the page
 * names, rendered or not. So this file holds nothing of the overlay: the tools are a dynamic
 * import behind the same flag, which the build folds away with everything they pull in.
 */
import { lazy, Suspense } from 'react';

const OverlayTools = import.meta.env.DEV
  ? lazy(() => import('../OverlayTools/OverlayTools.tsx'))
  : null;

function DevOverlay() {
  return (
    OverlayTools && (
      <Suspense fallback={null}>
        <OverlayTools />
      </Suspense>
    )
  );
}

export default DevOverlay;
