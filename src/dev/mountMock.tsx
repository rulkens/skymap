/**
 * mountMock — the dev-only `?mock=<name>` mount: renders the default export of
 * `src/dev/mocks/<name>.tsx` in its own root above the app, inside the app's store
 * so a mock can use real containers. main.tsx imports this behind
 * `import.meta.env.DEV`, so the build never sees it. See src/dev/mocks/README.md.
 */
import type { ComponentType } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import type { AppStore } from '../store/types';
import type { MockWindow } from '../@types/automation/MockWindow';
import styles from './mountMock.module.css';

const MOCKS = import.meta.glob<{ default: ComponentType }>('./mocks/*.tsx');

export async function mountMock(store: AppStore): Promise<void> {
  const name = new URLSearchParams(window.location.search).get('mock');
  if (!name) return;
  const load = MOCKS[`./mocks/${name}.tsx`];
  if (!load) {
    const known = Object.keys(MOCKS).map((path) => path.slice('./mocks/'.length, -'.tsx'.length));
    console.error(`?mock=${name}: no src/dev/mocks/${name}.tsx (have: ${known.join(', ')})`);
    return;
  }
  const { default: Mock } = await load();
  const host = document.createElement('div');
  document.body.append(host);
  flushSync(() =>
    createRoot(host).render(
      <Provider store={store}>
        <div className={styles.root}>
          <Mock />
        </div>
      </Provider>,
    ),
  );
  const win = window as MockWindow;
  win.__mockRevision = 1;
  // Fires after Fast Refresh has swapped the module; the driver adds two frames for React's commit.
  import.meta.hot?.on('vite:afterUpdate', () => {
    win.__mockRevision = (win.__mockRevision ?? 0) + 1;
  });
}
