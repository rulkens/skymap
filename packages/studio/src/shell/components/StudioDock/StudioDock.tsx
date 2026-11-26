import { useEffect, useRef } from 'react';
import DockGrabber from '../DockGrabber/DockGrabber';
import KeyBar from '../KeyBar/KeyBar';
import KeyHelp from '../KeyHelp/KeyHelp';
import NarrowNoticeContainer from '../../../containers/shell/NarrowNoticeContainer';
import TopBarContainer from '../../../containers/shell/TopBarContainer';
import TimelinePaneContainer from '../../../containers/timeline/TimelinePaneContainer';
import InspectorContainer from '../../../containers/inspector/InspectorContainer';
import { useDockHeight } from '../../hooks/useDockHeight';
import { useFocusRescue } from '../../hooks/useFocusRescue';
import { useKeysOverlay } from '../../hooks/useKeysOverlay';
import { useNoSwipeBack } from '../../hooks/useNoSwipeBack';
import { useStudioKeys } from '../../hooks/useStudioKeys';
import { APP_CLIP_REGISTRY } from '../../../../../../src/compositions/appClips';
import { useIsMobile } from '../../../../../../src/hooks/useIsMobile';
import type { ClipId } from '../../../../../../src/@types/animation/ClipId';
import type { StudioKeyId } from '../../@types/StudioKeyId';
import s from './StudioDock.module.css';

type StudioDockProps = {
  readonly clipId: ClipId;
  /** Runs a key's command: false when it had nothing to do. */
  readonly runCommand: (id: StudioKeyId) => boolean;
};

/** The studio's bottom dock: top bar, timeline, legend. Opaque, so the renderer never shows through. */
function StudioDock({ clipId, runCommand }: StudioDockProps) {
  const narrow = useIsMobile();
  const root = useRef<HTMLElement>(null);
  const [fraction, setFraction] = useDockHeight();
  const keys = useKeysOverlay(root);
  const onKeyDown = useStudioKeys(keys.toggle, runCommand);
  useFocusRescue(root);
  useNoSwipeBack(root);
  // Focus lives in the dock so its keys work at once, and a click on a row (not focusable) lands here.
  useEffect(() => root.current?.focus({ preventScroll: true }), []);

  return (
    <section
      ref={root}
      className={s.dock}
      style={{ height: `${fraction * 100}%` }}
      tabIndex={-1}
      aria-label={`Clip studio: ${APP_CLIP_REGISTRY[clipId].label}`}
      onKeyDown={onKeyDown}
    >
      <DockGrabber fraction={fraction} onChange={setFraction} />
      {narrow ? (
        <NarrowNoticeContainer />
      ) : (
        <>
          <TopBarContainer keysOpen={keys.open} onToggleKeys={keys.toggle} />
          <div className={s.body}>
            <TimelinePaneContainer />
            <div className={s.inspector}>
              <InspectorContainer />
            </div>
          </div>
          <KeyBar />
          {keys.open && <KeyHelp onClose={keys.close} />}
        </>
      )}
    </section>
  );
}

export default StudioDock;
