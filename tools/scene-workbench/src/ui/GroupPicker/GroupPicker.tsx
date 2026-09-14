/**
 * GroupPicker — the `scenes.json` list. Selecting an entry dispatches
 * `groupSelected`, which `watchGroupSaga` reacts to. Renders nothing until
 * the registry has at least one group — `EmptyState` covers the gap.
 */
import type { ChangeEvent, ReactNode } from 'react';

import { groupSelected } from '../../state/registry/registrySlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import styles from './GroupPicker.module.css';

function GroupPicker(): ReactNode {
  const dispatch = useAppDispatch();
  const groups = useAppSelector((state) => state.registry.groups);
  const selectedGroupId = useAppSelector((state) => state.registry.selectedGroupId);

  if (groups.length === 0) return null;

  const onChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    dispatch(groupSelected(event.target.value));
  };

  return (
    <div className={styles.root}>
      <label className={styles.label} htmlFor="group-picker">
        Group
      </label>
      <select
        id="group-picker"
        className={styles.select}
        value={selectedGroupId ?? ''}
        onChange={onChange}
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default GroupPicker;
