import type { TextSize, ThemePref, Tone } from '../../domain/types';
import { useApp } from '../context';
import { MetricSettings } from './settings/MetricSettings';
import { ReminderSettings } from './settings/ReminderSettings';
import { NotificationSettings } from './settings/NotificationSettings';
import { DataSettings } from './settings/DataSettings';

export function Settings() {
  const app = useApp();
  const save = async (patch: { tone?: Tone; textSize?: TextSize; theme?: ThemePref }) => {
    try {
      await app.actions.saveSettings(patch);
      app.toast('Saved.');
    } catch (e) {
      app.toast(e instanceof Error ? e.message : 'Not saved.', 'error');
    }
  };
  return (
    <section aria-labelledby="settings-h">
      <h2 id="settings-h">Settings</h2>

      <h3>Measurements</h3>
      {app.registry.all().map((def) => {
        const config = app.configFor(def.id);
        return config ? (
          <MetricSettings key={`${def.id}-${config.updatedAt}`} def={def} config={config} />
        ) : null;
      })}

      <ReminderSettings />
      <NotificationSettings />

      <div class="card">
        <h3 style={{ marginTop: 0 }}>Display</h3>
        <div class="field">
          <label for="theme">Appearance</label>
          <select
            id="theme"
            value={app.settings.theme}
            onChange={(e) => save({ theme: (e.target as HTMLSelectElement).value as ThemePref })}
          >
            <option value="system">Match my phone</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div class="field">
          <label for="tone">Message style</label>
          <select
            id="tone"
            value={app.settings.tone}
            onChange={(e) => save({ tone: (e.target as HTMLSelectElement).value as Tone })}
          >
            <option value="playful">Playful</option>
            <option value="neutral">Neutral</option>
          </select>
          <p class="hint">
            Playful adds a little personality to messages. Health information is always plain.
          </p>
        </div>
        <div class="field">
          <label for="text-size">Text size</label>
          <select
            id="text-size"
            value={app.settings.textSize}
            onChange={(e) => save({ textSize: (e.target as HTMLSelectElement).value as TextSize })}
          >
            <option value="standard">Standard</option>
            <option value="large">Large</option>
            <option value="xlarge">Extra large</option>
          </select>
        </div>
      </div>

      <DataSettings />

      <a class="btn btn-block" href="#/about">
        About, privacy and help
      </a>
    </section>
  );
}
