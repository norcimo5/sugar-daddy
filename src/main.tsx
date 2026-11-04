import { render } from 'preact';
import { useState } from 'preact/hooks';
import './styles.css';
import { openDatabase } from './db/idb';
import { createRepo } from './db/repo';
import { metricRegistry } from './domain/metrics';
import { appClock } from './app/clock';
import { registerServiceWorker } from './app/sw-register';
import { initInstall } from './app/install';

// Capture the browser's install offer before anything else (it can fire very early).
initInstall();
import { App } from './ui/App';
import type { Repo } from './db/repo';

let setUpdate: ((apply: () => void) => void) | null = null;
let pendingUpdate: (() => void) | null = null;

registerServiceWorker((apply) => {
  pendingUpdate = apply;
  setUpdate?.(apply);
});

function Root({ repo }: { repo: Repo }) {
  const [updateReady, setUpdateReady] = useState<(() => void) | null>(() => pendingUpdate);
  setUpdate = (apply) => setUpdateReady(() => apply);
  return <App repo={repo} registry={metricRegistry} clock={appClock} updateReady={updateReady} />;
}

async function start() {
  const root = document.getElementById('app');
  if (!root) return;
  try {
    const db = await openDatabase();
    const repo = createRepo(db, metricRegistry);
    render(<Root repo={repo} />, root);
    // Ask the browser to keep our storage; harmless if refused.
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Storage is unavailable.';
    render(
      <div class="app">
        <h1 class="brand">Sugar Daddy</h1>
        <div class="banner" role="alert">
          <strong>Sugar Daddy can't open its storage on this device.</strong>
          <span>{message}</span>
          <p>
            Private browsing modes can block storage. Try opening Sugar Daddy in a normal window.
          </p>
          <button type="button" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </div>,
      root,
    );
  }
}

void start();
