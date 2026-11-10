import { useEffect, useRef } from 'react';
import DockGrabber from '../DockGrabber/DockGrabber';
import KeyBar from '../KeyBar/KeyBar';
import KeyHelp from '../KeyHelp/KeyHelp';
import NarrowNotice from '../NarrowNotice/NarrowNotice';
import TopBar from '../TopBar/TopBar';
import TimelinePane from '../../../timeline/components/TimelinePane/TimelinePane';
import Inspector from '../../../inspector/components/Inspector/Inspector';
import { useDockHeight } from '../../hooks/useDockHeight';
import { useFocusRescue } from '../../hooks/useFocusRescue';
import { useKeysOverlay } from '../../hooks/useKeysOverlay';
import { useStudioKeys } from '../../hooks/useStudioKeys';
import { clipRegistry } from '../../../../../../src/data/animation/clips/clipRegistry';
import { useIsMobile } from '../../../../../../src/hooks/useIsMobile';
import type { ClipId } from '../../../../../../src/@types/animation/ClipId';
import s from './StudioDock.module.css';

type Props = { readonly clipId: ClipId };

/** The studio's bottom dock: top bar, timeline, legend. Opaque, so the renderer never shows through. */
function StudioDock({ clipId }: Props) {
  const narrow = useIsMobile();
  const root = useRef<HTMLElement>(null);
  const [fraction, setFraction] = useDockHeight();
  const keys = useKeysOverlay(root);
  const onKeyDown = useStudioKeys(keys.toggle);
  useFocusRescue(root);
  // Focus lives in the dock so its keys work at once, and a click on a row (not focusable) lands here.
  useEffect(() => root.current?.focus({ preventScroll: true }), []);

  return (
    <section
      ref={root}
      className={s.dock}
      style={{ height: `${fraction * 100}%` }}
      tabIndex={-1}
      aria-label={`Clip studio: ${clipRegistry[clipId].label}`}
      onKeyDown={onKeyDown}
    >
      <DockGrabber fraction={fraction} onChange={setFraction} />
      {narrow ? (
        <NarrowNotice />
      ) : (
        <>
          <TopBar keysOpen={keys.open} onToggleKeys={keys.toggle} />
          <div className={s.body}>
            <TimelinePane />
            <aside className={s.inspector} aria-label="Inspector">
              <Inspector />
            </aside>
          </div>
          <KeyBar />
          {keys.open && <KeyHelp onClose={keys.close} />}
        </>
      )}
    </section>
  );
}

export default StudioDock;
