import { useMemo, useRef, useState } from 'preact/hooks';
import type { Measurement, MetricDefinition } from '../../domain/types';
import { useApp } from '../context';
import { primaryMetric, unitLabel } from '../../domain/metrics';
import { evaluateStatus } from '../../domain/thresholds';
import { savedMessage } from '../../domain/copy';
import {
  currentTimeZone,
  formatDateTime,
  fromLocalInputValue,
  toLocalInputValue,
} from '../../domain/time';
import { createSubmitGuard } from '../../app/submitGuard';
import { previousRoute } from '../router';

function goBack(fallback: string, navigate: (r: string) => void) {
  const prev = previousRoute();
  // Never return to the screen being left (e.g. after deleting the reading it showed).
  navigate(prev && prev !== location.hash && !prev.startsWith('#/log') ? prev : fallback);
}

export function LogEntry(props: { metricId?: string; editId?: string }) {
  const app = useApp();
  const existing = props.editId ? app.measurements.find((m) => m.id === props.editId) : undefined;
  const def = app.registry.get(
    existing?.metricId ?? (props.metricId || primaryMetric(app.registry).id),
  );

  if (props.editId && !existing) {
    return (
      <section class="card">
        <h2>Reading not found</h2>
        <p>This reading may have been deleted.</p>
        <a class="btn" href="#/history">
          Go to History
        </a>
      </section>
    );
  }
  const config = def ? app.configFor(def.id) : undefined;
  if (!def || (!existing && !config?.enabled)) {
    return (
      <section class="card">
        <h2>Not available</h2>
        <p>This measurement is not turned on. You can turn it on in Settings.</p>
        <a class="btn" href="#/settings">
          Open Settings
        </a>
      </section>
    );
  }
  return <EntryForm key={existing?.id ?? def.id} def={def} existing={existing} />;
}

function EntryForm({ def, existing }: { def: MetricDefinition; existing?: Measurement }) {
  const app = useApp();
  const config = app.configFor(def.id);
  const unit = existing?.unit ?? config?.unit ?? def.defaultUnit;
  const guard = useMemo(() => createSubmitGuard(), []);
  const [raw, setRaw] = useState<Record<string, string>>(() => ({ ...(existing?.raw ?? {}) }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [initialTakenAtLocal] = useState(() =>
    existing ? toLocalInputValue(new Date(existing.takenAt)) : '',
  );
  const [takenAtLocal, setTakenAtLocal] = useState(initialTakenAtLocal);
  const [deleting, setDeleting] = useState(false);
  const [showNote, setShowNote] = useState(Boolean(existing?.note));
  const [note, setNote] = useState(existing?.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  const title = existing ? `Edit ${def.name.toLowerCase()} reading` : def.logLabel;
  const uLabel = unitLabel(def, unit);

  async function onSubmit(e: Event) {
    e.preventDefault();
    if (guard.busy) return; // a save is already in flight (rapid repeated taps)
    setSaveError(null);
    let takenAt: string;
    if (existing && takenAtLocal === initialTakenAtLocal) {
      // Time not touched: keep the stored instant exactly (seconds and all).
      takenAt = existing.takenAt;
    } else if (takenAtLocal) {
      const d = fromLocalInputValue(takenAtLocal);
      if (!d) {
        setErrors({ takenAt: 'Enter a valid date and time.' });
        return;
      }
      takenAt = d.toISOString();
    } else {
      takenAt = app.clock.now().toISOString();
    }
    setSaving(true);
    try {
      const outcome = await guard.run(() =>
        app.actions.saveMeasurement(
          {
            metricId: def.id,
            raw,
            unit,
            takenAt,
            timeZone: existing?.timeZone ?? currentTimeZone(),
            note: showNote ? note : existing?.note,
          },
          existing,
        ),
      );
      if (!outcome.ran) return;
      const result = outcome.value;
      if (!result.ok) {
        setErrors(result.error);
        const firstKey = Object.keys(result.error)[0];
        document.getElementById(`f-${firstKey}`)?.focus();
        return;
      }
      setErrors({});
      const status = config ? evaluateStatus(def, config, result.value) : 'unconfigured';
      app.toast(existing ? 'Changes saved.' : savedMessage(app.settings.tone, status));
      if (existing) goBack('/history', app.navigate);
      else app.navigate('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Not saved.';
      setSaveError(msg);
      app.toast(`Not saved. ${msg}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!existing || deleting) return;
    setDeleting(true);
    try {
      await app.actions.deleteMeasurement(existing.id);
      app.toast('Reading deleted.');
      goBack('/history', app.navigate);
    } catch (err) {
      app.toast(err instanceof Error ? err.message : 'Could not delete.', 'error');
      setDeleting(false);
    }
  }

  return (
    <section aria-labelledby="log-h">
      <h2 id="log-h">{title}</h2>
      <form onSubmit={onSubmit} noValidate class="card">
        {def.fields.map((f, i) => {
          const err = errors[f.key];
          const lim = f.limits(unit);
          const fieldUnit = f.unitLabel ?? uLabel;
          const single = def.fields.length === 1;
          return (
            <div class="field" key={f.key}>
              <label for={`f-${f.key}`} class={single ? 'sr-only' : undefined}>
                {single
                  ? `${def.name} in ${fieldUnit}`
                  : `${f.label}${f.required ? '' : ' (optional)'}`}
              </label>
              <input
                id={`f-${f.key}`}
                ref={i === 0 ? firstRef : undefined}
                class={single ? 'big-input' : undefined}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint={i === def.fields.length - 1 ? 'done' : 'next'}
                autoFocus={i === 0 && !existing}
                value={raw[f.key] ?? ''}
                aria-invalid={err ? 'true' : undefined}
                aria-describedby={`h-${f.key}${err ? ` e-${f.key}` : ''}`}
                onInput={(e) => setRaw({ ...raw, [f.key]: (e.target as HTMLInputElement).value })}
              />
              <div id={`h-${f.key}`} class={single ? 'unit-suffix' : 'hint'}>
                {single ? fieldUnit : `${fieldUnit} · ${lim.min}–${lim.max}`}
              </div>
              {err ? (
                <div id={`e-${f.key}`} class="error" role="alert">
                  {err}
                </div>
              ) : null}
            </div>
          );
        })}

        <div class="field">
          {showTime ? (
            <>
              <label for="f-time">Date and time taken</label>
              <input
                id="f-time"
                type="datetime-local"
                value={takenAtLocal}
                max={toLocalInputValue(app.clock.now())}
                aria-invalid={errors.takenAt ? 'true' : undefined}
                onInput={(e) => setTakenAtLocal((e.target as HTMLInputElement).value)}
              />
            </>
          ) : (
            <p style={{ margin: 0 }}>
              <span class="muted">Time: </span>
              <strong>
                {takenAtLocal
                  ? formatDateTime(fromLocalInputValue(takenAtLocal) ?? app.clock.now())
                  : 'Now'}
              </strong>{' '}
              <button
                type="button"
                class="btn-link"
                onClick={() => {
                  if (!takenAtLocal) setTakenAtLocal(toLocalInputValue(app.clock.now()));
                  setShowTime(true);
                }}
              >
                Change time
              </button>
            </p>
          )}
          {errors.takenAt ? (
            <div class="error" role="alert">
              {errors.takenAt}
            </div>
          ) : null}
        </div>

        <div class="field">
          {showNote ? (
            <>
              <label for="f-note">Note (optional)</label>
              <textarea
                id="f-note"
                maxLength={1000}
                value={note}
                onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
              />
            </>
          ) : (
            <button type="button" class="btn-link" onClick={() => setShowNote(true)}>
              Add note
            </button>
          )}
        </div>

        {saveError ? (
          <div class="error" role="alert">
            Not saved. {saveError}
          </div>
        ) : null}

        <button
          type="submit"
          class="btn btn-primary btn-xl"
          disabled={saving}
          aria-busy={saving ? 'true' : undefined}
          data-testid="save"
        >
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Save'}
        </button>
        <button
          type="button"
          class="btn btn-block"
          style={{ marginTop: '10px' }}
          onClick={() => goBack('/', app.navigate)}
        >
          Cancel
        </button>
      </form>

      {existing ? (
        <div class="card">
          <p class="hint" style={{ marginTop: 0 }}>
            Entered as {Object.values(existing.raw).join(' / ')} {unitLabel(def, existing.unit)} ·{' '}
            {existing.source === 'import' ? 'Imported' : 'Entered by you'} · Added{' '}
            {formatDateTime(new Date(existing.createdAt))}
            {existing.updatedAt !== existing.createdAt
              ? ` · Edited ${formatDateTime(new Date(existing.updatedAt))}`
              : ''}
          </p>
          {confirmDelete ? (
            <div role="alertdialog" aria-labelledby="del-h" aria-modal="false">
              <p id="del-h">
                <strong>Delete this reading?</strong> This cannot be undone.
              </p>
              <div class="btn-row">
                <button
                  type="button"
                  class="btn btn-danger"
                  onClick={onDelete}
                  disabled={deleting}
                  autoFocus
                >
                  Yes, delete
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              class="btn btn-danger btn-block"
              onClick={() => setConfirmDelete(true)}
            >
              Delete reading
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
