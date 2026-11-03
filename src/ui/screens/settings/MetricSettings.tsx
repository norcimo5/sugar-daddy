import { useState } from 'preact/hooks';
import type { MetricConfig, MetricDefinition, Thresholds, Unit } from '../../../domain/types';
import { useApp } from '../../context';
import { unitLabel } from '../../../domain/metrics';
import { validateThresholds } from '../../../domain/thresholds';
import { parseNumber } from '../../../domain/validation';

const KEYS: { key: keyof Thresholds; label: string }[] = [
  { key: 'targetLow', label: 'Target range — low' },
  { key: 'targetHigh', label: 'Target range — high' },
  { key: 'alertLow', label: 'Low alert threshold' },
  { key: 'alertHigh', label: 'High alert threshold' },
];

type Draft = Record<string, Record<keyof Thresholds, string>>;

function toDraft(def: MetricDefinition, config: MetricConfig): Draft {
  const out: Draft = {};
  for (const f of def.thresholdFields) {
    const t = config.thresholds[f] ?? {};
    out[f] = {
      targetLow: t.targetLow?.toString() ?? '',
      targetHigh: t.targetHigh?.toString() ?? '',
      alertLow: t.alertLow?.toString() ?? '',
      alertHigh: t.alertHigh?.toString() ?? '',
    };
  }
  return out;
}

export function MetricSettings({ def, config }: { def: MetricDefinition; config: MetricConfig }) {
  const app = useApp();
  const [draft, setDraft] = useState<Draft>(() => toDraft(def, config));
  const [error, setError] = useState<string | null>(null);
  const isPrimary = Boolean(def.primary);
  const uLabel = unitLabel(def, config.unit);
  const hasAny = Object.values(config.thresholds).some((t) => Object.keys(t).length > 0);
  // Unit the threshold form is in: the unit existing values were entered in, else the current unit.
  const thresholdUnit: Unit = hasAny ? (config.thresholdUnit ?? config.unit) : config.unit;
  const tLabel = unitLabel(def, thresholdUnit);

  async function save(next: MetricConfig, message: string) {
    try {
      await app.actions.saveConfig(next);
      app.toast(message);
    } catch (e) {
      app.toast(e instanceof Error ? e.message : 'Not saved.', 'error');
    }
  }

  async function onToggle(enabled: boolean) {
    await save(
      { ...config, enabled },
      enabled ? `${def.name} turned on.` : `${def.name} turned off.`,
    );
  }

  async function onUnit(unit: Unit) {
    // Thresholds are never converted: they stay exactly as the clinician gave them, in the unit
    // they were entered in (thresholdUnit). Readings are converted for evaluation instead.
    const next: MetricConfig = {
      ...config,
      unit,
      thresholdUnit: hasAny ? thresholdUnit : undefined,
    };
    await save(next, `${def.name} unit set to ${unitLabel(def, unit)}.`);
  }

  async function onSaveThresholds(e: Event) {
    e.preventDefault();
    const thresholds: Record<string, Thresholds> = {};
    for (const field of def.thresholdFields) {
      const t: Thresholds = {};
      const d = draft[field];
      if (!d) continue;
      for (const { key, label } of KEYS) {
        const raw = d[key].trim();
        if (!raw) continue;
        const n = parseNumber(raw);
        if (n === null) {
          setError(`${label}: enter a number or leave it blank.`);
          return;
        }
        t[key] = n;
      }
      const msg = validateThresholds(t);
      if (msg) {
        setError(def.thresholdFields.length > 1 ? `${labelFor(def, field)}: ${msg}` : msg);
        return;
      }
      if (Object.keys(t).length) thresholds[field] = t;
    }
    setError(null);
    const any = Object.keys(thresholds).length > 0;
    await save(
      { ...config, thresholds, thresholdUnit: any ? thresholdUnit : undefined },
      'Clinician values saved.',
    );
  }

  return (
    <div class="card" data-testid={`metric-settings-${def.id}`}>
      <h3 style={{ marginTop: 0 }}>{def.name}</h3>
      {isPrimary ? null : (
        <label class="check">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onToggle((e.target as HTMLInputElement).checked)}
          />
          Track {def.name.toLowerCase()}
        </label>
      )}
      {config.enabled ? (
        <>
          {def.units.length > 1 ? (
            <div class="field">
              <label for={`unit-${def.id}`}>Unit</label>
              <select
                id={`unit-${def.id}`}
                value={config.unit}
                onChange={(e) => onUnit((e.target as HTMLSelectElement).value as Unit)}
              >
                {def.units.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(def, u)}
                  </option>
                ))}
              </select>
              <p class="hint">
                Changes how readings are shown. Saved readings keep the value and unit they were
                entered with.
              </p>
            </div>
          ) : (
            <p class="hint">Unit: {uLabel}</p>
          )}

          <details>
            <summary style={{ minHeight: '44px', fontWeight: 650, cursor: 'pointer' }}>
              Target range and alerts{' '}
              <span class="muted">({hasAny ? 'configured' : 'not configured'})</span>
            </summary>
            <p class="hint">
              Enter only values your clinician has given you, in {tLabel}. Leave blank if you don't
              have them. Sugar Daddy never guesses these.
              {hasAny && thresholdUnit !== config.unit
                ? ` These were entered in ${tLabel} and are kept exactly as entered; readings are converted to compare.`
                : ''}
            </p>
            <form onSubmit={onSaveThresholds} noValidate>
              {def.thresholdFields.map((field) => (
                <fieldset key={field} style={{ border: 0, padding: 0, margin: '0 0 8px' }}>
                  {def.thresholdFields.length > 1 ? (
                    <legend style={{ fontWeight: 700 }}>{labelFor(def, field)}</legend>
                  ) : null}
                  <div class="grid-2">
                    {KEYS.map(({ key, label }) => {
                      const id = `th-${def.id}-${field}-${key}`;
                      return (
                        <div class="field" key={key}>
                          <label for={id}>{label}</label>
                          <input
                            id={id}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={draft[field]?.[key] ?? ''}
                            onInput={(e) =>
                              setDraft({
                                ...draft,
                                [field]: {
                                  ...(draft[field] as Record<keyof Thresholds, string>),
                                  [key]: (e.target as HTMLInputElement).value,
                                },
                              })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              {error ? (
                <div class="error" role="alert">
                  {error}
                </div>
              ) : null}
              <button type="submit" class="btn btn-primary btn-block">
                Save {def.name.toLowerCase()} values
              </button>
            </form>
          </details>
        </>
      ) : null}
    </div>
  );
}

function labelFor(def: MetricDefinition, field: string): string {
  return def.fields.find((f) => f.key === field)?.label ?? field;
}
