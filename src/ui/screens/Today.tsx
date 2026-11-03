import { useApp } from '../context';
import { formatMeasurementValue, unitLabel } from '../../domain/metrics';
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
  const glucose = app.registry.require('glucose');
  const glucoseConfig = app.configFor('glucose');
  const todayStart = startOfLocalDay(now).toISOString();

  const latestGlucose = app.measurements.find((m) => m.metricId === 'glucose');
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

  const otherMetrics = app.enabledMetrics.filter((d) => d.id !== 'glucose');
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

      <div class="card latest" aria-labelledby="latest-h">
        <h3 id="latest-h" style={{ margin: 0 }} class="muted">
          Latest glucose
        </h3>
        {latestGlucose ? (
          <>
            <div class="value" data-testid="latest-value">
              {formatMeasurementValue(glucose, latestGlucose, glucoseConfig?.unit)}
              <small>{unitLabel(glucose, glucoseConfig?.unit ?? latestGlucose.unit)}</small>
            </div>
            <div class="muted">
              {localDateKey(new Date(latestGlucose.takenAt)) === localDateKey(now)
                ? `Today at ${formatTime(new Date(latestGlucose.takenAt))}`
                : new Date(latestGlucose.takenAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
            </div>
            {glucoseConfig ? (
              <StatusBadge kind={evaluateStatus(glucose, glucoseConfig, latestGlucose)} />
            ) : null}
          </>
        ) : (
          <p class="muted" style={{ margin: 0 }}>
            No glucose readings yet.
          </p>
        )}
      </div>

      <a class="btn btn-primary btn-xl" href="#/log/glucose" data-testid="log-glucose">
        <Icon name="plus" />
        {glucose.logLabel}
      </a>

      {otherMetrics.length ? (
        <div class="btn-row" style={{ marginTop: '12px' }}>
          {otherMetrics.map((d) => (
            <a key={d.id} class="btn" href={`#/log/${d.id}`}>
              <Icon name="plus" />
              {d.logLabel}
            </a>
          ))}
        </div>
      ) : null}

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
