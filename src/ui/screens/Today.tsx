import { useApp } from '../context';
import {
  contextLabel,
  formatMeasurementValue,
  primaryMetric,
  unitLabel,
} from '../../domain/metrics';
import { targetFraction } from '../ringFraction';
import { RingGauge } from '../components/RingGauge';
import { useInstall } from '../../app/install';
import { evaluateStatus } from '../../domain/thresholds';
import { formatDateLong, formatTime, localDateKey, startOfLocalDay } from '../../domain/time';
import { evaluateReminders } from '../../domain/reminders';
import { emptyTodayMessage } from '../../domain/copy';
import { StatusBadge } from '../components/StatusBadge';
import { MeasurementRow } from '../components/MeasurementRow';
import { Icon } from '../components/Icon';
import { useNow } from '../useNow';

export function Today() {
  const app = useApp();
  const now = useNow(app.clock);
  const glucose = primaryMetric(app.registry);
  const glucoseConfig = app.configFor(glucose.id);
  const { mode: installMode, promptInstall } = useInstall();
  const glucoseUnit = glucoseConfig?.unit ?? glucose.defaultUnit;
  const whenLabel = (iso: string) =>
    localDateKey(new Date(iso)) === localDateKey(now)
      ? `Today at ${formatTime(new Date(iso))}`
      : new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const todayStart = startOfLocalDay(now).toISOString();

  const latestGlucose = app.measurements.find((m) => m.metricId === glucose.id);
  const enabledIds = new Set(app.enabledMetrics.map((d) => d.id));
  const todays = app.measurements.filter(
    (m) => m.takenAt >= todayStart && enabledIds.has(m.metricId),
  );

  const rem = evaluateReminders({
    now,
    reminders: app.reminders.filter((r) => enabledIds.has(r.metricId)),
    measurements: app.measurements,
    dismissals: app.dismissals,
    graceMinutes: app.settings.graceMinutes,
  });

  const otherMetrics = app.enabledMetrics.filter((d) => d.id !== glucose.id);
  const nextLabel = rem.next
    ? `${rem.next.date === localDateKey(now) ? 'Today' : 'Tomorrow'} at ${formatTime(rem.next.dueAt)} · ${app.registry.require(rem.next.reminder.metricId).shortName}`
    : null;

  return (
    <section aria-labelledby="today-h">
      <p class="date-line">{formatDateLong(now)}</p>
      <h2 id="today-h" class="sr-only">
        Today
      </h2>

      {rem.missed.map((s) => {
        const def = app.registry.require(s.reminder.metricId);
        return (
          <div
            class="banner"
            role="status"
            key={`${s.reminder.id}@${s.date}`}
            data-testid="missed-banner"
          >
            <strong>
              Missed {def.name.toLowerCase()} reading — {formatTime(s.dueAt)}
            </strong>
            <span>No {def.name.toLowerCase()} reading was logged for this time.</span>
            <div class="btn-row" style={{ marginTop: '10px' }}>
              <a class="btn btn-primary" href={`#/log/${def.id}`}>
                Log now
              </a>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await app.actions.dismissSlot(s.reminder.id, s.date);
                    app.toast('Marked as not needed.');
                  } catch (e) {
                    app.toast(e instanceof Error ? e.message : 'Not saved.', 'error');
                  }
                }}
              >
                Not needed
              </button>
            </div>
          </div>
        );
      })}

      {rem.due.map((s) => {
        const def = app.registry.require(s.reminder.metricId);
        return (
          <div class="banner info" role="status" key={`due-${s.reminder.id}`}>
            <strong>
              {def.name} reading due — {formatTime(s.dueAt)}
            </strong>
          </div>
        );
      })}

      <div class="card latest hero" aria-labelledby="latest-h">
        <h3 id="latest-h" class="label" style={{ margin: 0 }}>
          Latest {glucose.shortName.toLowerCase()}
        </h3>
        {latestGlucose ? (
          <>
            <div data-testid="latest-value">
              <RingGauge
                label={`Latest ${glucose.shortName.toLowerCase()}`}
                value={formatMeasurementValue(glucose, latestGlucose, glucoseUnit)}
                unit={unitLabel(glucose, glucoseUnit)}
                caption={[
                  whenLabel(latestGlucose.takenAt),
                  contextLabel(glucose, latestGlucose.context),
                ]
                  .filter(Boolean)
                  .join('\n')}
                fraction={
                  glucoseConfig ? targetFraction(glucose, glucoseConfig, latestGlucose) : null
                }
              />
            </div>
            {glucoseConfig ? (
              <StatusBadge kind={evaluateStatus(glucose, glucoseConfig, latestGlucose)} />
            ) : null}
          </>
        ) : (
          <p class="muted" style={{ margin: 0 }}>
            No {glucose.shortName.toLowerCase()} readings yet.
          </p>
        )}
      </div>

      <a class="btn btn-primary btn-xl" href={`#/log/${glucose.id}`} data-testid="log-glucose">
        <Icon name="plus" />
        {glucose.logLabel}
      </a>

      {installMode !== 'installed' && !app.settings.installCardDismissed ? (
        <div
          class="card panel-accent install-card"
          role="region"
          aria-label="Install the app"
          data-testid="install-card"
        >
          <p class="label" style={{ marginTop: 0 }}>
            Install the app
          </p>
          <p style={{ margin: '4px 0 10px' }}>
            Open Sugar Daddy from your home screen like a normal app — it works even without
            internet.
          </p>
          <div class="btn-row">
            {installMode === 'prompt' ? (
              <button
                type="button"
                class="btn btn-primary"
                onClick={async () => {
                  if (await promptInstall())
                    app.toast('Installed. Open Sugar Daddy from your home screen.');
                }}
              >
                Install
              </button>
            ) : (
              <a class="btn btn-primary" href="#/install">
                How to install
              </a>
            )}
            <button
              type="button"
              onClick={() =>
                app.actions
                  .saveSettings({ installCardDismissed: true })
                  .catch((e: unknown) =>
                    app.toast(e instanceof Error ? e.message : 'Not saved.', 'error'),
                  )
              }
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}

      <ul class="tiles" aria-label="Measurements">
        {app.enabledMetrics.map((d) => {
          const latest = app.measurements.find((m) => m.metricId === d.id);
          const u = app.configFor(d.id)?.unit ?? d.defaultUnit;
          return (
            <li key={d.id} class="tile" data-testid={`tile-${d.id}`}>
              <a href={`#/metric/${d.id}`} class="tile-main">
                <span class="label">{d.name}</span>
                <span class="tile-value">
                  {latest ? (
                    <>
                      {formatMeasurementValue(d, latest, u)} <small>{unitLabel(d, u)}</small>
                    </>
                  ) : (
                    <small>No readings</small>
                  )}
                </span>
                {latest ? <span class="row-meta">{whenLabel(latest.takenAt)}</span> : null}
              </a>
              <a class="btn" href={`#/log/${d.id}`} aria-label={d.logLabel}>
                Record
              </a>
            </li>
          );
        })}
      </ul>

      <p class="muted" style={{ marginTop: '14px' }} data-testid="next-reminder">
        <Icon name="bell" />{' '}
        {nextLabel ? (
          <>Next reminder: {nextLabel}</>
        ) : (
          <>
            No reminders set. <a href="#/settings">Add one in Settings</a>
          </>
        )}
      </p>

      <div class="card">
        <h3 style={{ marginTop: 0 }}>Today's readings</h3>
        {todays.length ? (
          <ul class="list" data-testid="today-list">
            {todays.map((m) => {
              const def = app.registry.get(m.metricId);
              if (!def) return null;
              return (
                <li key={m.id}>
                  <MeasurementRow
                    m={m}
                    def={def}
                    config={app.configFor(m.metricId)}
                    showMetric={otherMetrics.length > 0}
                    onOpen={(id) => app.navigate(`/edit/${id}`)}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p class="empty">{emptyTodayMessage(app.settings.tone)}</p>
        )}
      </div>
    </section>
  );
}
