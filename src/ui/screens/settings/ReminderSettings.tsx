import { useState } from 'preact/hooks';
import type { Reminder } from '../../../domain/types';
import { GRACE_MAX, GRACE_MIN } from '../../../domain/types';
import { parseHHMM } from '../../../domain/reminders';
import { useApp } from '../../context';
import { newId } from '../../../app/state';
import { primaryMetric } from '../../../domain/metrics';

const GRACE_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240].filter(
  (g) => g >= GRACE_MIN && g <= GRACE_MAX,
);

export function ReminderSettings() {
  const app = useApp();
  const [newTime, setNewTime] = useState('08:00');
  const primaryId = primaryMetric(app.registry).id;
  const [newMetric, setNewMetric] = useState(primaryId);
  const [error, setError] = useState<string | null>(null);
  const sorted = app.reminders.slice().sort((a, b) => a.time.localeCompare(b.time));

  async function run(action: () => Promise<void>, message: string) {
    try {
      await action();
      app.toast(message);
    } catch (e) {
      app.toast(e instanceof Error ? e.message : 'Not saved.', 'error');
    }
  }

  async function add(e: Event) {
    e.preventDefault();
    if (!parseHHMM(newTime)) {
      setError('Choose a time.');
      return;
    }
    setError(null);
    const now = app.clock.now().toISOString();
    const r: Reminder = {
      id: newId(),
      time: newTime,
      metricId: app.enabledMetrics.some((d) => d.id === newMetric) ? newMetric : primaryId,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    await run(() => app.actions.saveReminder(r), `Reminder added for ${newTime}.`);
  }

  return (
    <div class="card" data-testid="reminder-settings">
      <h3 style={{ marginTop: 0 }}>Reminders</h3>
      <p class="hint">
        Sugar Daddy shows a "missed reading" note on the Today screen when a reminder time passes
        without a reading. Reminders never create readings.
      </p>
      {sorted.length ? (
        <ul class="list">
          {sorted.map((r) => {
            const def = app.registry.get(r.metricId);
            return (
              <li
                key={r.id}
                style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 0' }}
              >
                <label class="check" style={{ flex: 1, margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) =>
                      run(
                        () =>
                          app.actions.saveReminder({
                            ...r,
                            enabled: (e.target as HTMLInputElement).checked,
                          }),
                        (e.target as HTMLInputElement).checked
                          ? 'Reminder turned on.'
                          : 'Reminder turned off.',
                      )
                    }
                  />
                  <span>
                    {r.time} · {def?.shortName ?? r.metricId}
                  </span>
                </label>
                <button
                  type="button"
                  class="btn-danger"
                  aria-label={`Delete ${r.time} ${def?.shortName ?? ''} reminder`}
                  onClick={() => run(() => app.actions.deleteReminder(r.id), 'Reminder deleted.')}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="muted">No reminders yet.</p>
      )}

      <form onSubmit={add} noValidate style={{ marginTop: '12px' }}>
        <div class="grid-2">
          <div class="field">
            <label for="rem-time">Time</label>
            <input
              id="rem-time"
              type="time"
              value={newTime}
              onInput={(e) => setNewTime((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="field">
            <label for="rem-metric">For</label>
            <select
              id="rem-metric"
              value={newMetric}
              onChange={(e) => setNewMetric((e.target as HTMLSelectElement).value)}
            >
              {app.enabledMetrics.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.shortName}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error ? (
          <div class="error" role="alert">
            {error}
          </div>
        ) : null}
        <button type="submit" class="btn btn-block">
          Add reminder
        </button>
      </form>

      <div class="field" style={{ marginTop: '16px' }}>
        <label for="grace">Count a reading as missed after</label>
        <select
          id="grace"
          value={String(app.settings.graceMinutes)}
          onChange={(e) => {
            const graceMinutes = Number((e.target as HTMLSelectElement).value);
            void run(() => app.actions.saveSettings({ graceMinutes }), 'Saved.');
          }}
        >
          {GRACE_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g < 60
                ? `${g} minutes`
                : g % 60
                  ? `${g / 60} hours`
                  : `${g / 60} hour${g === 60 ? '' : 's'}`}
            </option>
          ))}
        </select>
        <p class="hint">A reading up to 2 hours before the reminder time also counts.</p>
      </div>
    </div>
  );
}
