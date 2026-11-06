/** Albedo Bench React entry. */
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App';
import { createBenchStore } from './store/createBenchStore';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');
createRoot(rootEl).render(
  <StrictMode>
    <Provider store={createBenchStore()}>
      <App />
    </Provider>
  </StrictMode>,
);
