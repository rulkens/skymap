/*
 * Feedback — dev-only: pick an element or drag a rectangle on any page, type a note, and the dev
 * server writes it to disk for the coding agent (tools/site/feedbackPlugin.ts). No crop image is
 * saved: capture cannot see <video> or WebGL; the note's rectangle, scroll and flight time are
 * enough to re-shoot.
 */
import { useEffect, useRef, useState } from 'react';

import type { FeedbackFlight } from '../../../../../../tools/site/@types/FeedbackFlight';
import type { FeedbackNote } from '../../../../../../tools/site/@types/FeedbackNote';
import type { FlightTimeline } from '../../../@types/FlightTimeline';
import { clamp } from '../../../utils/clamp';
import { flightAt } from '../../../utils/flightAt';

import { devOverlay } from '../../overlay/devOverlay';
import { FEEDBACK_ROUTE } from '../../overlay/feedbackRoute';
import { pageNotes } from '../../overlay/pageNotes';
import { recall } from '../../overlay/recall';
import { remember } from '../../overlay/remember';
import { useDevOverlayEscape } from '../../overlay/useDevOverlayEscape';
import { useDevOverlayMode } from '../../overlay/useDevOverlayMode';
import { useDevOverlayOn } from '../../overlay/useDevOverlayOn';
import type { FeedbackDraft } from '../@types/FeedbackDraft';
import type { FeedbackPin } from '../@types/FeedbackPin';
import type { FeedbackSelection } from '../@types/FeedbackSelection';
import { describeElement } from '../describeElement';
import { DRAFT_KEY } from '../draftKey';
import { pickElement } from '../pickElement';
import { useFeedbackPins } from '../useFeedbackPins';
import { viewRect } from '../viewRect';
import FeedbackCapture from '../FeedbackCapture/FeedbackCapture.tsx';
import FeedbackDock from '../FeedbackDock/FeedbackDock.tsx';
import FeedbackPanel from '../FeedbackPanel/FeedbackPanel.tsx';
import FeedbackPins from '../FeedbackPins/FeedbackPins.tsx';
import styles from './Feedback.module.css';

// The tall track the flight scrolls through (`Flight-track`, the module's class).
const FLIGHT_TRACK = '[class*="Flight-track"]';

/** The flight's progress, read the way the flight reads it, so a note says where in the film it was. */
function flightState(): FeedbackFlight | null {
  const flight = document.querySelector<HTMLElement>('[data-flight]');
  const track = flight?.querySelector<HTMLElement>(FLIGHT_TRACK);
  if (!flight?.dataset.timeline || !track) return null;
  const timeline = JSON.parse(flight.dataset.timeline) as FlightTimeline;
  const progress = clamp(
    -track.getBoundingClientRect().top / (track.offsetHeight - innerHeight),
    0,
    1,
  );
  return {
    progress: Number(progress.toFixed(4)),
    filmSec: Number(flightAt(timeline, progress).sec.toFixed(3)),
  };
}

/** The note as the endpoint stores it: the words, the area, and enough of the page to find it again. */
function buildFeedbackNote({ kind, rect, element }: FeedbackSelection, text: string): FeedbackNote {
  return {
    text: text.trim(),
    timestamp: new Date().toISOString(),
    page: { url: location.href, path: location.pathname, title: document.title },
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
    flight: flightState(),
    selection: kind,
    rect: { page: rect, viewport: viewRect(rect, window) },
    element: describeElement(element),
    userAgent: navigator.userAgent,
  };
}

/** The draft kept for this page, or null: another page's draft is not this one's to restore. */
function readDraft(): FeedbackDraft | null {
  const stored = recall(DRAFT_KEY);
  if (!stored) return null;
  const draft = JSON.parse(stored) as FeedbackDraft;
  return draft.path === location.pathname ? draft : null;
}

function Feedback() {
  const on = useDevOverlayOn();
  const mode = useDevOverlayMode();
  const [pins, setPins] = useFeedbackPins();
  const [selection, setSelection] = useState<FeedbackSelection | null>(null);
  const [text, setText] = useState('');
  const toggle = useRef<HTMLButtonElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const end = () => {
    setSelection(null);
    remember(DRAFT_KEY, null);
  };
  const cancel = () => {
    end();
    toggle.current?.focus();
  };

  const choose = (next: FeedbackSelection, words = '') => {
    setSelection(next);
    setText(words);
  };

  useEffect(() => {
    if (!on && selection) end();
  }, [on, selection]);

  useEffect(() => {
    if (!selection) return;
    const { kind, rect } = selection;
    remember(DRAFT_KEY, JSON.stringify({ kind, rect, text, path: location.pathname }));
  }, [selection, text]);

  // The browser puts the scroll position back after load; the draft is placed once it has.
  useEffect(() => {
    if (!devOverlay.isOn()) return;
    let frame = 0;
    const restore = () => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const draft = readDraft();
          if (!draft) return;
          const view = viewRect(draft.rect, window);
          const element = pickElement(view.x + view.width / 2, view.y + view.height / 2);
          choose({ kind: draft.kind, rect: draft.rect, element }, draft.text);
        });
      });
    };
    if (document.readyState === 'complete') restore();
    else addEventListener('load', restore, { once: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('load', restore);
    };
  }, []);

  useDevOverlayEscape(() => {
    if (!selection) return false;
    cancel();
    return true;
  });

  const send = async () => {
    const note = buildFeedbackNote(selection!, text);
    const res = await fetch(FEEDBACK_ROUTE, { method: 'POST', body: JSON.stringify(note) });
    if (!res.ok) throw new Error(`the server said ${res.status}`);
    const { id } = (await res.json()) as { id: string };
    const rect = selection!.rect;
    pageNotes.add(id, note);
    setPins((all) => [
      ...all,
      { id, n: Math.max(0, ...all.map((p) => p.n)) + 1, text: note.text, rect },
    ]);
    cancel();
  };

  const remove = async (pin: FeedbackPin) => {
    try {
      await pageNotes.remove(pin.id);
      setPins((all) => all.filter((p) => p !== pin));
    } catch (error) {
      console.error('feedback: delete failed', error);
    }
  };

  return (
    <>
      <div className={styles.root} data-overlay-ui="">
        {on && mode === 'notes' && (
          <FeedbackCapture
            locked={!!selection}
            onChoose={choose}
            onPressWhileLocked={() => textarea.current?.focus()}
          />
        )}
        {on && selection && (
          <FeedbackPanel
            rect={selection.rect}
            text={text}
            onText={setText}
            onSend={send}
            onCancel={cancel}
            textRef={textarea}
          />
        )}
        <FeedbackDock
          on={on}
          pins={pins}
          onToggle={() => devOverlay.setOn(!on)}
          onDelete={(pin) => void remove(pin)}
          toggleRef={toggle}
        />
      </div>
      {on && <FeedbackPins pins={pins} />}
    </>
  );
}

export default Feedback;
