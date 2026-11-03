import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type {
  AppSnapshot,
  Dismissal,
  Measurement,
  MeasurementInput,
  MetricConfig,
  MetricDefinition,
  MetricRegistry,
  Reminder,
  Result,
  Settings,
} from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { buildMeasurement, reviseMeasurement } from '../domain/measurement';
import { dismissalId } from '../domain/reminders';
import { localDateKey } from '../domain/time';
import type { RestorePlan } from '../domain/backup';
import type { Repo } from '../db/repo';
import type { Clock } from './clock';

export interface AppData {
  loading: boolean;
  loadError: string | null;
  settings: Settings;
  configs: MetricConfig[];
  measurements: Measurement[];
  reminders: Reminder[];
  dismissals: Dismissal[];
  /** Enabled metric definitions in display order. */
  enabledMetrics: MetricDefinition[];
  configFor(metricId: string): MetricConfig | undefined;
  registry: MetricRegistry;
  clock: Clock;
  actions: AppActions;
}

export interface AppActions {
  saveMeasurement(
    input: MeasurementInput,
    existing?: Measurement,
  ): Promise<Result<Measurement, Record<string, string>>>;
  deleteMeasurement(id: string): Promise<void>;
  saveSettings(patch: Partial<Settings>): Promise<void>;
  saveConfig(config: MetricConfig): Promise<void>;
  saveReminder(reminder: Reminder): Promise<void>;
  deleteReminder(id: string): Promise<void>;
  dismissSlot(reminderId: string, date: string): Promise<void>;
  snapshot(): Promise<AppSnapshot>;
  applyRestore(plan: RestorePlan): Promise<void>;
  reload(): Promise<void>;
}

export function newId(): string {
  return crypto.randomUUID();
}

/**
 * Single source of truth for UI state. Every mutation awaits the repository
 * (IndexedDB transaction complete) and then reloads, so the UI only ever shows
 * what was actually persisted. Errors propagate to the caller to display.
 */
export function useAppData(repo: Repo, registry: MetricRegistry, clock: Clock): AppData {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [configs, setConfigs] = useState<MetricConfig[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [dismissals, setDismissals] = useState<Dismissal[]>([]);

  const reload = useCallback(async () => {
    try {
      const [s, c, m, r, d] = await Promise.all([
        repo.getSettings(),
        repo.listMetricConfigs(),
        repo.listMeasurements(),
        repo.listReminders(),
        repo.listDismissals(),
      ]);
      setSettings(s);
      setConfigs(c);
      setMeasurements(m);
      setReminders(r);
      setDismissals(d);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not read saved data.');
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const configFor = useCallback(
    (metricId: string) => configs.find((c) => c.metricId === metricId),
    [configs],
  );

  const enabledMetrics = useMemo(
    () =>
      registry
        .all()
        .filter((d) => configs.find((c) => c.metricId === d.id)?.enabled)
        .slice()
        .sort((a, b) => a.order - b.order),
    [registry, configs],
  );

  const actions = useMemo<AppActions>(
    () => ({
      async saveMeasurement(input, existing) {
        const def = registry.require(input.metricId);
        const now = clock.now();
        const result = existing
          ? reviseMeasurement(existing, def, input, now)
          : buildMeasurement(def, input, now, newId);
        if (!result.ok) return result;
        await repo.putMeasurement(result.value);
        await reload();
        return result;
      },
      async deleteMeasurement(id) {
        await repo.deleteMeasurement(id);
        await reload();
      },
      async saveSettings(patch) {
        const current = await repo.getSettings();
        await repo.saveSettings({ ...current, ...patch });
        await reload();
      },
      async saveConfig(config) {
        await repo.saveMetricConfig({ ...config, updatedAt: clock.now().toISOString() });
        await reload();
      },
      async saveReminder(reminder) {
        await repo.putReminder({ ...reminder, updatedAt: clock.now().toISOString() });
        await reload();
      },
      async deleteReminder(id) {
        await repo.deleteReminder(id);
        await reload();
      },
      async dismissSlot(reminderId, date) {
        await repo.putDismissal({
          id: dismissalId(reminderId, date),
          reminderId,
          date,
          createdAt: clock.now().toISOString(),
        });
        await reload();
      },
      snapshot: () => repo.snapshot(),
      async applyRestore(plan) {
        await repo.applySnapshot(plan.snapshot, plan.mode);
        await reload();
      },
      reload,
    }),
    [repo, registry, clock, reload],
  );

  return {
    loading,
    loadError,
    settings,
    configs,
    measurements,
    reminders,
    dismissals,
    enabledMetrics,
    configFor,
    registry,
    clock,
    actions,
  };
}

export function todayKey(clock: Clock): string {
  return localDateKey(clock.now());
}
