import { useState } from 'preact/hooks';
import { useApp } from '../../context';
import { csvFilename, measurementsToCsv } from '../../../domain/csv';
import {
  backupFilename,
  buildBackup,
  parseBackup,
  planRestore,
  type BackupFile,
  type RestoreMode,
  type RestorePlan,
} from '../../../domain/backup';
import { formatDateTime } from '../../../domain/time';
import { downloadText } from '../../../app/download';

export function DataSettings() {
  const app = useApp();
  const [pending, setPending] = useState<{ backup: BackupFile; name: string } | null>(null);
  const [plans, setPlans] = useState<Record<RestoreMode, RestorePlan> | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [csvScope, setCsvScope] = useState('all');

  async function exportCsv() {
    const ms = app.measurements.filter((m) => csvScope === 'all' || m.metricId === csvScope);
    downloadText(
      csvFilename(csvScope === 'all' ? 'all' : csvScope.replace(/_/g, '-'), app.clock.now()),
      measurementsToCsv(ms, app.registry),
      'text/csv;charset=utf-8',
    );
    app.toast(`Exported ${ms.length} reading${ms.length === 1 ? '' : 's'} as CSV.`);
  }

  async function exportBackup() {
    try {
      const now = app.clock.now();
      const snap = await app.actions.snapshot();
      const backup = buildBackup(snap, now, __APP_VERSION__);
      downloadText(backupFilename(now), JSON.stringify(backup, null, 2), 'application/json');
      await app.actions.saveSettings({ lastBackupAt: now.toISOString() });
      app.toast('Backup downloaded. Keep it somewhere safe.');
    } catch (e) {
      app.toast(e instanceof Error ? e.message : 'Backup failed.', 'error');
    }
  }

  async function onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    setRestoreError(null);
    setPending(null);
    setPlans(null);
    setConfirmReplace(false);
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseBackup(text, app.registry);
      if (!parsed.ok) {
        setRestoreError(parsed.error);
        return;
      }
      const existing = await app.actions.snapshot();
      setPending({ backup: parsed.value, name: file.name });
      setPlans({
        merge: planRestore(existing, parsed.value, 'merge'),
        replace: planRestore(existing, parsed.value, 'replace'),
      });
    } catch {
      setRestoreError('That file could not be read. Nothing was changed.');
    }
  }

  async function apply(mode: RestoreMode) {
    if (!plans || !pending) return;
    setBusy(true);
    try {
      // Re-plan against current data so anything changed since the preview is respected.
      const fresh = planRestore(await app.actions.snapshot(), pending.backup, mode);
      await app.actions.applyRestore(fresh);
      app.toast(mode === 'merge' ? 'Backup merged.' : 'All data replaced from backup.');
      setPending(null);
      setPlans(null);
      setConfirmReplace(false);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  const last = app.settings.lastBackupAt;
  const c = plans?.merge.counts;

  return (
    <div class="card" data-testid="data-settings">
      <h3 style={{ marginTop: 0 }}>Your data</h3>
      <p>
        Your readings are stored only on this device. Clearing browser data, uninstalling the app,
        or the phone freeing up space can erase them. Download a backup now and then.
      </p>
      <p class="muted" data-testid="backup-status">
        {last ? `Last backup: ${formatDateTime(new Date(last))}` : 'Never backed up.'}
      </p>

      <button type="button" class="btn btn-primary btn-block" onClick={exportBackup}>
        Download backup (JSON)
      </button>

      <div class="field" style={{ marginTop: '16px' }}>
        <label for="csv-scope">Export as spreadsheet (CSV)</label>
        <select
          id="csv-scope"
          value={csvScope}
          onChange={(e) => setCsvScope((e.target as HTMLSelectElement).value)}
        >
          <option value="all">All measurements</option>
          {app.registry.all().map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <button type="button" class="btn btn-block" onClick={exportCsv}>
        Export CSV
      </button>

      <h3>Restore from backup</h3>
      <label for="restore-file" class="btn btn-block" style={{ marginBottom: 0 }}>
        Choose backup file…
      </label>
      <input
        id="restore-file"
        type="file"
        accept="application/json,.json"
        class="sr-only"
        onChange={onFile}
        data-testid="restore-file"
      />
      {restoreError ? (
        <div class="error" role="alert">
          {restoreError}
        </div>
      ) : null}
      {pending && c ? (
        <div
          class="banner info"
          role="region"
          aria-label="Restore preview"
          data-testid="restore-preview"
        >
          <strong>{pending.name}</strong>
          <p style={{ margin: '4px 0' }}>
            Made {formatDateTime(new Date(pending.backup.exportedAt))}. Contains {c.total} reading
            {c.total === 1 ? '' : 's'}: {c.measurementsNew} new, {c.measurementsDuplicate} already
            on this device. {c.remindersNew + c.remindersDuplicate} reminder
            {c.remindersNew + c.remindersDuplicate === 1 ? '' : 's'}.
          </p>
          <p class="hint">Nothing changes until you choose below.</p>
          {confirmReplace ? (
            <div role="alertdialog" aria-labelledby="replace-h">
              <p id="replace-h">
                <strong>Replace everything?</strong> All readings, reminders and settings on this
                device will be deleted and replaced with the backup. This cannot be undone.
              </p>
              <div class="btn-row">
                <button
                  type="button"
                  class="btn btn-danger"
                  disabled={busy}
                  onClick={() => apply('replace')}
                >
                  Yes, replace all
                </button>
                <button type="button" onClick={() => setConfirmReplace(false)}>
                  Go back
                </button>
              </div>
            </div>
          ) : (
            <div class="btn-row">
              <button
                type="button"
                class="btn btn-primary"
                disabled={busy}
                onClick={() => apply('merge')}
              >
                Merge (keep what's here)
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirmReplace(true)}>
                Replace all…
              </button>
              <button
                type="button"
                class="btn-link"
                onClick={() => {
                  setPending(null);
                  setPlans(null);
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : null}
      <p class="hint">
        Merge adds readings from the backup and keeps anything already here with the same ID.
      </p>
    </div>
  );
}
