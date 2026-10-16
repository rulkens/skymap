/** ExhibitSection — open an exhibit or play a clip, and leave either with Exit. */

import { REMOTE_CLIP_LABELS } from '../../../data/remote/remoteClipLabels';
import { REMOTE_EXHIBIT_LABELS } from '../../../data/remote/remoteExhibitLabels';
import type { ClipId } from '../../../@types/animation/ClipId';
import type { ExhibitId } from '../../../@types/exhibits/ExhibitId';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import controls from '../remoteControls.module.css';

const EXHIBITS = Object.entries(REMOTE_EXHIBIT_LABELS) as [ExhibitId, string][];
const CLIPS = (Object.entries(REMOTE_CLIP_LABELS) as [ClipId, string | null][]).flatMap(
  ([id, label]) => (label ? [{ id, label }] : []),
);

export type ExhibitSectionProps = { onCommand: (command: RemoteCommand) => void };

function ExhibitSection({ onCommand }: ExhibitSectionProps) {
  return (
    <section className={controls.section}>
      <h2 className={controls.heading}>Exhibits and clips</h2>
      <div className={controls.row}>
        {EXHIBITS.map(([exhibitId, label]) => (
          <button
            key={exhibitId}
            type="button"
            className={controls.button}
            onClick={() => onCommand({ name: 'goTo', payload: { kind: 'exhibit', exhibitId } })}
          >
            {label}
          </button>
        ))}
        {CLIPS.map((clip) => (
          <button
            key={clip.id}
            type="button"
            className={controls.button}
            onClick={() => onCommand({ name: 'clipStart', payload: { clipId: clip.id } })}
          >
            {clip.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={controls.button}
        onClick={() => onCommand({ name: 'exitTakeover', payload: null })}
      >
        Exit
      </button>
    </section>
  );
}

export default ExhibitSection;
