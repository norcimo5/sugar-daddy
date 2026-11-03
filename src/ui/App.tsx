import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { MetricRegistry } from '../domain/types';
import type { Repo } from '../db/repo';
import type { Clock } from '../app/clock';
import { useAppData } from '../app/state';
import { AppContext, type UiApi } from './context';
import { navigate as hashNavigate, useRoute } from './router';
import { TabBar } from './components/TabBar';
import { Today } from './screens/Today';
import { LogEntry } from './screens/LogEntry';
import { History } from './screens/History';
import { Trends } from './screens/Trends';
import { Settings } from './screens/Settings';
import { About } from './screens/About';
import { CARE_TEAM_NOTE, DISCLAIMER, TAGLINE, welcomeMessage } from '../domain/copy';
import { evaluateReminders } from '../domain/reminders';
import { reminderNotificationText, showNotification, slotsToNotify } from '../app/notify';
import { useNow } from './useNow';

export interface AppProps {
  repo: Repo;
  registry: MetricRegistry;
  clock: Clock;
  /** Set by the service-worker registration when a new version is waiting. */
  updateReady?: (() => void) | null;
}

export function App(props: AppProps) {
  const data = useAppData(props.repo, props.registry, props.clock);
  const route = useRoute();
  const [toast, setToast] = useState<{ message: string; kind: 'info' | 'error'; n: number } | null>(
    null,
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const mainRef = useRef<HTMLElement>(null);

  const showToast = useCallback<UiApi['toast']>((message, kind = 'info') => {
    clearTimeout(toastTimer.current);
    setToast((t) => ({ message, kind, n: (t?.n ?? 0) + 1 }));
    toastTimer.current = setTimeout(() => setToast(null), kind === 'error' ? 8000 : 3500);
  }, []);

  const ui = useMemo<UiApi>(() => ({ toast: showToast, navigate: hashNavigate }), [showToast]);

  // Text size preference.
  useEffect(() => {
    document.documentElement.dataset.textSize = data.settings.textSize;
  }, [data.settings.textSize]);

  // Move focus to the new screen's heading for screen-reader users.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    const h = mainRef.current?.querySelector<HTMLElement>('h2');
    if (h && route.name !== 'log') {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
  }, [route]);

  // In-page reminder notifications (best effort; only while the app is alive).
  const now = useNow(props.clock);
  const fired = useRef(new Set<string>());
  useEffect(() => {
    if (!data.settings.notificationsEnabled || data.loading) return;
    const enabled = new Set(data.enabledMetrics.map((d) => d.id));
    const { due } = evaluateReminders({
      now,
      reminders: data.reminders.filter((r) => enabled.has(r.metricId)),
      measurements: data.measurements,
      dismissals: data.dismissals,
      graceMinutes: data.settings.graceMinutes,
    });
    for (const slot of slotsToNotify(due, fired.current)) {
      const def = data.registry.get(slot.reminder.metricId);
      const text = reminderNotificationText(def?.shortName ?? 'reading');
      void showNotification(text.title, text.body, `${slot.reminder.id}@${slot.date}`);
    }
  }, [now, data]);

  const ctx = { ...data, ...ui };

  let screen;
  if (data.loading) {
    screen = (
      <p class="muted" role="status">
        Loading…
      </p>
    );
  } else if (data.loadError) {
    screen = (
      <div class="banner" role="alert">
        <strong>Sugar Daddy couldn't read saved data on this device.</strong>
        <span>{data.loadError}</span>
        <div class="btn-row" style={{ marginTop: '10px' }}>
          <button type="button" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  } else {
    switch (route.name) {
      case 'log':
        screen = <LogEntry metricId={route.metricId} />;
        break;
      case 'edit':
        screen = <LogEntry editId={route.id} />;
        break;
      case 'history':
        screen = <History />;
        break;
      case 'trends':
        screen = <Trends />;
        break;
      case 'settings':
        screen = <Settings />;
        break;
      case 'about':
        screen = <About />;
        break;
      default:
        screen = <Today />;
    }
  }

  const tab =
    route.name === 'log' || route.name === 'edit'
      ? 'today'
      : route.name === 'about'
        ? 'settings'
        : route.name;

  return (
    <AppContext.Provider value={ctx}>
      <a
        class="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      <div class="app">
        <header class="app-header">
          <img src="/icons/icon-192.png" alt="" width={40} height={40} />
          <div>
            <h1 class="brand">Sugar Daddy</h1>
            <p class="tagline">{TAGLINE}</p>
          </div>
        </header>

        {props.updateReady ? (
          <div class="banner info" role="status">
            <strong>Update available</strong>
            <button type="button" class="btn-primary" onClick={props.updateReady}>
              Reload
            </button>
          </div>
        ) : null}

        {!data.loading && !data.loadError && !data.settings.firstRunDone ? (
          <div class="card" role="region" aria-label="Welcome" data-testid="welcome">
            <h3 style={{ marginTop: 0 }}>{welcomeMessage(data.settings.tone)}</h3>
            <p class="disclaimer">{DISCLAIMER}</p>
            <p>{CARE_TEAM_NOTE}</p>
            <button
              type="button"
              class="btn-primary btn-block"
              onClick={() => void data.actions.saveSettings({ firstRunDone: true })}
            >
              Got it
            </button>
          </div>
        ) : null}

        <main id="main" ref={mainRef} tabIndex={-1} style={{ outline: 'none' }}>
          {screen}
        </main>
      </div>
      <TabBar current={tab} />
      <div aria-live="polite" role="status" class="sr-only" data-testid="live">
        {toast?.kind === 'info' ? toast.message : ''}
      </div>
      <div aria-live="assertive" role="alert" class="sr-only">
        {toast?.kind === 'error' ? toast.message : ''}
      </div>
      {toast ? (
        <div
          class={`toast${toast.kind === 'error' ? ' error' : ''}`}
          aria-hidden="true"
          key={toast.n}
          data-testid="toast"
        >
          {toast.message}
        </div>
      ) : null}
    </AppContext.Provider>
  );
}
