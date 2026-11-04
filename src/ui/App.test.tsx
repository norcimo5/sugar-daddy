import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/preact';
import { IDBFactory } from 'fake-indexeddb';
import { App } from './App';
import { openDatabase, StorageError } from '../db/idb';
import { createRepo, type Repo } from '../db/repo';
import { metricRegistry } from '../domain/metrics';
import { createClock } from '../app/clock';
import { buildBackup } from '../domain/backup';
import type { Measurement } from '../domain/types';

// 2026-06-15 11:00 EDT (tests run with TZ=America/New_York).
const NOW = '2026-06-15T15:00:00.000Z';

async function setup(opts: { wrap?: (r: Repo) => Repo } = {}) {
  const db = await openDatabase({ idb: new IDBFactory(), name: `t-${Math.random()}` });
  const base = createRepo(db, metricRegistry);
  const repo = opts.wrap ? opts.wrap(base) : base;
  const clock = createClock({ fixedStart: NOW });
  location.hash = '#/';
  const utils = render(<App repo={repo} registry={metricRegistry} clock={clock} />);
  await screen.findByText('Latest glucose');
  return { repo: base, clock, ...utils };
}

function glucose(id: string, value: number, takenAt: string, note?: string): Measurement {
  return {
    id,
    metricId: 'glucose',
    value: { value },
    raw: { value: String(value) },
    unit: 'mg/dL',
    takenAt,
    timeZone: 'America/New_York',
    note,
    source: 'manual',
    createdAt: takenAt,
    updatedAt: takenAt,
  };
}

async function go(hash: string) {
  // Like a real browser: setting the hash fires exactly one (async) hashchange.
  const fired = new Promise((r) => window.addEventListener('hashchange', r, { once: true }));
  location.hash = hash;
  await fired;
}

afterEach(() => {
  cleanup();
  location.hash = '';
});

describe('App integration', () => {
  it('starts with an empty database: welcome, disclaimer, no sample data', async () => {
    await setup();
    expect(screen.getByTestId('welcome')).toBeInTheDocument();
    expect(screen.getAllByText(/does not provide medical advice/).length).toBeGreaterThan(0);
    expect(screen.getByText('No glucose readings yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('today-list')).toBeNull();
    expect(screen.getByText(/No reminders set/)).toBeInTheDocument();
  });

  it('creates, edits and deletes a glucose reading, persisting each step', async () => {
    const { repo } = await setup();
    await go('#/log/glucose');
    const input = await screen.findByLabelText('Glucose in mg/dL');
    fireEvent.input(input, { target: { value: '112' } });
    fireEvent.click(screen.getByTestId('save'));
    await screen.findByTestId('latest-value');
    expect(screen.getByTestId('latest-value')).toHaveTextContent('112');
    let saved = await repo.listMeasurements();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ value: { value: 112 }, raw: { value: '112' }, unit: 'mg/dL' });
    expect(saved[0]!.note).toBeUndefined();
    const firstTakenAt = saved[0]!.takenAt;
    const firstZone = saved[0]!.timeZone;

    // Edit
    await go(`#/edit/${saved[0]!.id}`);
    const editInput = await screen.findByLabelText('Glucose in mg/dL');
    fireEvent.input(editInput, { target: { value: '118' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(async () => {
      saved = await repo.listMeasurements();
      expect(saved[0]!.value.value).toBe(118);
    });
    expect(saved[0]!.createdAt).not.toBe(saved[0]!.updatedAt);
    // Time untouched → stored instant, zone and provenance are preserved exactly.
    expect(saved[0]!.takenAt).toBe(firstTakenAt);
    expect(saved[0]!.timeZone).toBe(firstZone);
    expect(saved[0]!.source).toBe('manual');
    // The app returns to the previous screen after saving.
    await screen.findByRole('heading', { name: 'Today', hidden: true });

    // Delete requires confirmation
    await go(`#/edit/${saved[0]!.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete reading' }));
    expect(await repo.listMeasurements()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' })); // double tap is harmless
    await waitFor(async () => expect(await repo.listMeasurements()).toHaveLength(0));
    await screen.findByRole('heading', { name: 'Today', hidden: true });
  });

  it('rejects invalid input without saving or rewriting the value', async () => {
    const { repo } = await setup();
    await go('#/log/glucose');
    const input = await screen.findByLabelText('Glucose in mg/dL');
    fireEvent.input(input, { target: { value: '5000' } });
    fireEvent.click(screen.getByTestId('save'));
    expect(await screen.findByText(/between 10 and 1000/)).toBeInTheDocument();
    expect(input).toHaveValue('5000');
    expect(await repo.listMeasurements()).toHaveLength(0);
  });

  it('prevents duplicate submissions from rapid repeated taps', async () => {
    const { repo } = await setup();
    await go('#/log/glucose');
    const input = await screen.findByLabelText('Glucose in mg/dL');
    fireEvent.input(input, { target: { value: '140' } });
    const save = screen.getByTestId('save');
    fireEvent.click(save);
    fireEvent.click(save);
    fireEvent.click(save);
    await screen.findByTestId('latest-value');
    expect(await repo.listMeasurements()).toHaveLength(1);
  });

  it('Today and History reflect persisted records', async () => {
    const { repo } = await setup();
    await repo.putMeasurement(glucose('a', 101, '2026-06-15T12:00:00.000Z'));
    await repo.putMeasurement(glucose('b', 150, '2026-06-15T14:00:00.000Z', 'after lunch'));
    await repo.putMeasurement(glucose('c', 90, '2026-06-13T14:00:00.000Z'));
    cleanup();
    await setup({ wrap: () => repo });
    const today = within(screen.getByTestId('today-list'));
    expect(today.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByTestId('latest-value')).toHaveTextContent('150');
    expect(today.getAllByRole('button')[0]).toHaveAccessibleName(/150 mg\/dL.*has a note/);

    await go('#/history');
    await screen.findByTestId('history-list');
    // 2026-06-15 is a Monday, so the week view holds only today's two readings.
    expect(screen.getByTestId('history-count')).toHaveTextContent('2 readings');
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    await waitFor(() =>
      expect(screen.getByTestId('history-count')).toHaveTextContent('3 readings'),
    );
  });

  it('filters History by metric once a second metric is enabled', async () => {
    const { repo } = await setup();
    const now = new Date().toISOString();
    await repo.saveMetricConfig({
      metricId: 'blood_pressure',
      enabled: true,
      unit: 'mmHg',
      thresholds: {},
      createdAt: now,
      updatedAt: now,
    });
    await repo.putMeasurement(glucose('g', 100, '2026-06-15T13:00:00.000Z'));
    await repo.putMeasurement({
      ...glucose('bp', 0, '2026-06-15T13:30:00.000Z'),
      metricId: 'blood_pressure',
      unit: 'mmHg',
      value: { systolic: 120, diastolic: 80 },
      raw: { systolic: '120', diastolic: '80' },
    });
    cleanup();
    await setup({ wrap: () => repo });
    await go('#/history');
    await screen.findByTestId('history-list');
    expect(screen.getByTestId('history-count')).toHaveTextContent('2 readings');
    fireEvent.change(screen.getByLabelText('Measurement'), { target: { value: 'blood_pressure' } });
    await waitFor(() => expect(screen.getByTestId('history-count')).toHaveTextContent('1 reading'));
    expect(screen.getByTestId('history-list')).toHaveTextContent('120/80');
  });

  it('shows clinician status only when configured, and never playful copy when out of range', async () => {
    const { repo } = await setup();
    await repo.saveMetricConfig({
      metricId: 'glucose',
      enabled: true,
      unit: 'mg/dL',
      thresholds: { value: { targetLow: 70, targetHigh: 180 } },
      createdAt: NOW,
      updatedAt: NOW,
    });
    cleanup();
    await setup({ wrap: () => repo });
    await go('#/log/glucose');
    fireEvent.input(await screen.findByLabelText('Glucose in mg/dL'), { target: { value: '250' } });
    fireEvent.click(screen.getByTestId('save'));
    await screen.findByTestId('latest-value');
    expect(screen.getAllByText('Above target range').length).toBeGreaterThan(0);
    expect(screen.getByTestId('live')).toHaveTextContent('Reading saved.');
    expect(screen.getByTestId('live').textContent).not.toMatch(/Daddy|Sweet/);
  });

  it('configures a reminder and shows / dismisses the missed-reading indicator', async () => {
    const { repo } = await setup();
    await go('#/settings');
    const settings = within(await screen.findByTestId('reminder-settings'));
    fireEvent.input(settings.getByLabelText('Time'), { target: { value: '09:00' } });
    fireEvent.click(settings.getByRole('button', { name: 'Add reminder' }));
    await waitFor(async () => expect(await repo.listReminders()).toHaveLength(1));

    await go('#/');
    const banner = await screen.findByTestId('missed-banner');
    expect(banner).toHaveTextContent(/Missed glucose reading/);
    fireEvent.click(within(banner).getByRole('button', { name: 'Not needed' }));
    await waitFor(() => expect(screen.queryByTestId('missed-banner')).toBeNull());
    expect(await repo.listMeasurements()).toHaveLength(0);
    expect(screen.getByTestId('next-reminder')).toHaveTextContent(/Tomorrow at/);
  });

  it('a reading inside the reminder window clears the missed indicator', async () => {
    const { repo } = await setup();
    const now = NOW;
    await repo.putReminder({
      id: 'r1',
      time: '09:30',
      metricId: 'glucose',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    cleanup();
    await setup({ wrap: () => repo });
    expect(await screen.findByTestId('missed-banner')).toBeInTheDocument();
    await repo.putMeasurement(glucose('x', 110, '2026-06-15T13:45:00.000Z')); // 09:45 EDT
    cleanup();
    await setup({ wrap: () => repo });
    expect(screen.queryByTestId('missed-banner')).toBeNull();
  });

  it('restores a backup with preview and merge, without silent overwrite', async () => {
    const { repo } = await setup();
    await repo.putMeasurement(glucose('keep', 95, '2026-06-14T12:00:00.000Z'));
    const snap = await repo.snapshot();
    const backup = buildBackup(
      {
        ...snap,
        measurements: [
          { ...glucose('keep', 999, '2026-06-14T12:00:00.000Z') },
          glucose('new', 133, '2026-06-14T13:00:00.000Z'),
        ],
      },
      new Date(NOW),
      '1.0.0',
    );
    cleanup();
    await setup({ wrap: () => repo });
    await go('#/settings');
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    const input = await screen.findByTestId('restore-file');
    fireEvent.change(input, { target: { files: [file] } });
    const preview = await screen.findByTestId('restore-preview');
    expect(preview).toHaveTextContent('1 new, 1 already on this device');
    expect(await repo.listMeasurements()).toHaveLength(1); // nothing changed yet
    fireEvent.click(within(preview).getByRole('button', { name: /Merge/ }));
    await waitFor(async () => expect(await repo.listMeasurements()).toHaveLength(2));
    const kept = (await repo.listMeasurements()).find((m) => m.id === 'keep');
    expect(kept!.value.value).toBe(95);
  });

  it('rejects a malformed backup with a useful error and changes nothing', async () => {
    const { repo } = await setup();
    await go('#/settings');
    const file = new File(['{"format":"nope"}'], 'bad.json', { type: 'application/json' });
    fireEvent.change(await screen.findByTestId('restore-file'), { target: { files: [file] } });
    const data = within(screen.getByTestId('data-settings'));
    expect(await data.findByText(/backup/i, { selector: '.error' })).toBeInTheDocument();
    expect(screen.queryByTestId('restore-preview')).toBeNull();
    expect(await repo.listMeasurements()).toHaveLength(0);
  });

  it('never reports success when storage fails; keeps the entered value', async () => {
    await setup({
      wrap: (r) => ({
        ...r,
        putMeasurement: () =>
          Promise.reject(
            new StorageError('Your device is out of storage space. Nothing was saved.'),
          ),
      }),
    });
    await go('#/log/glucose');
    const input = await screen.findByLabelText('Glucose in mg/dL');
    fireEvent.input(input, { target: { value: '123' } });
    fireEvent.click(screen.getByTestId('save'));
    expect(
      (await screen.findAllByText(/Not saved\. Your device is out of storage space/)).length,
    ).toBeGreaterThan(0);
    expect(input).toHaveValue('123');
    expect(screen.queryByText(/Reading saved/)).toBeNull();
  });

  it('switching glucose units never rewrites the clinician thresholds', async () => {
    const { repo } = await setup();
    await go('#/settings');
    const card = within(await screen.findByTestId('metric-settings-glucose'));
    fireEvent.input(card.getByLabelText('Target range — low'), { target: { value: '70' } });
    fireEvent.input(card.getByLabelText('Target range — high'), { target: { value: '180' } });
    fireEvent.click(card.getByRole('button', { name: 'Save glucose values' }));
    const stored = async () =>
      (await repo.listMetricConfigs()).find((c) => c.metricId === 'glucose')!;
    await waitFor(async () =>
      expect((await stored()).thresholds.value).toEqual({ targetLow: 70, targetHigh: 180 }),
    );
    expect((await stored()).thresholdUnit).toBe('mg/dL');

    for (const unit of ['mmol/L', 'mg/dL', 'mmol/L']) {
      const c = within(screen.getByTestId('metric-settings-glucose'));
      fireEvent.change(c.getByLabelText('Unit'), { target: { value: unit } });
      await waitFor(async () => expect((await stored()).unit).toBe(unit));
      expect((await stored()).thresholds.value).toEqual({ targetLow: 70, targetHigh: 180 });
      expect((await stored()).thresholdUnit).toBe('mg/dL');
    }
    // A 3.9 mmol/L reading (≈70.3 mg/dL) is in range; 3.8 (≈68.5) is below.
    const now = NOW;
    await repo.putMeasurement({ ...glucose('m', 3.8, now), unit: 'mmol/L', raw: { value: '3.8' } });
    cleanup();
    await setup({ wrap: () => repo });
    expect(screen.getAllByText('Below target range').length).toBeGreaterThan(0);
  });

  describe('storyboard features', () => {
    it('saves context, the chosen unit and a back-dated time exactly', async () => {
      const { repo } = await setup();
      await go('#/log/glucose');
      fireEvent.click(await screen.findByRole('button', { name: 'mmol/L' }));
      fireEvent.input(screen.getByLabelText('Glucose in mmol/L'), { target: { value: '6.1' } });
      fireEvent.change(screen.getByLabelText(/When was it taken/), {
        target: { value: 'before_meal' },
      });
      fireEvent.input(screen.getByLabelText('Date'), { target: { value: '2026-06-14' } });
      fireEvent.input(screen.getByLabelText('Time'), { target: { value: '07:30' } });
      fireEvent.click(screen.getByTestId('save'));
      await waitFor(async () => expect(await repo.listMeasurements()).toHaveLength(1));
      const [m] = await repo.listMeasurements();
      expect(m).toMatchObject({
        unit: 'mmol/L',
        value: { value: 6.1 },
        raw: { value: '6.1' },
        context: 'before_meal',
        takenAt: '2026-06-14T11:30:00.000Z', // 07:30 EDT
      });
    });

    it('stamps an untouched new reading with the moment Save is tapped', async () => {
      const { repo, clock } = await setup();
      await go('#/log/glucose');
      fireEvent.input(await screen.findByLabelText('Glucose in mg/dL'), {
        target: { value: '99' },
      });
      const before = clock.now().getTime();
      fireEvent.click(screen.getByTestId('save'));
      await waitFor(async () => expect(await repo.listMeasurements()).toHaveLength(1));
      const t = Date.parse((await repo.listMeasurements())[0]!.takenAt);
      expect(t).toBeGreaterThanOrEqual(before);
      expect(t - before).toBeLessThan(5000);
    });

    it('per-measurement screen lists recent readings with inline delete and View all', async () => {
      const { repo } = await setup();
      await repo.putMeasurement({
        ...glucose('a', 101, '2026-06-15T12:00:00.000Z'),
        context: 'fasting',
      });
      await repo.putMeasurement(glucose('b', 150, '2026-06-15T14:00:00.000Z'));
      cleanup();
      await setup({ wrap: () => repo });
      fireEvent.click(within(screen.getByTestId('tile-glucose')).getByText('Glucose'));
      const recent = within(await screen.findByTestId('recent-list'));
      expect(recent.getAllByRole('listitem')).toHaveLength(2);
      expect(recent.getByText(/Fasting/)).toBeInTheDocument();
      fireEvent.click(recent.getByRole('button', { name: /^Delete 150 mg\/dL/ }));
      expect(await repo.listMeasurements()).toHaveLength(2); // confirmation required
      fireEvent.click(recent.getByRole('button', { name: 'Yes, delete' }));
      await waitFor(async () => expect(await repo.listMeasurements()).toHaveLength(1));
      expect(screen.getByRole('link', { name: /View all/ })).toHaveAttribute(
        'href',
        '#/history/glucose',
      );
      expect(screen.getByTestId('add-record')).toHaveAttribute('href', '#/log/glucose');
    });

    it('shares a reading without the note, falling back to copying', async () => {
      const { repo } = await setup();
      await repo.putMeasurement(glucose('a', 101, '2026-06-15T12:00:00.000Z', 'private note'));
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      cleanup();
      await setup({ wrap: () => repo });
      await go('#/metric/glucose');
      fireEvent.click(await screen.findByRole('button', { name: /^Share 101 mg\/dL/ }));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      const text = writeText.mock.calls[0]![0] as string;
      expect(text).toContain('101 mg/dL');
      expect(text).not.toContain('private note');
      expect(await screen.findByTestId('live')).toHaveTextContent('Copied');
    });

    it('History filters by context for the selected measurement', async () => {
      const { repo } = await setup();
      await repo.putMeasurement({
        ...glucose('a', 101, '2026-06-15T12:00:00.000Z'),
        context: 'fasting',
      });
      await repo.putMeasurement({
        ...glucose('b', 150, '2026-06-15T14:00:00.000Z'),
        context: 'after_meal',
      });
      cleanup();
      await setup({ wrap: () => repo });
      await go('#/history/glucose');
      await screen.findByTestId('history-list');
      expect(screen.getByTestId('history-count')).toHaveTextContent('2 readings');
      fireEvent.change(screen.getByLabelText('When taken'), { target: { value: 'fasting' } });
      await waitFor(() =>
        expect(screen.getByTestId('history-count')).toHaveTextContent('1 reading'),
      );
    });

    it('theme toggle switches and persists the theme', async () => {
      const { repo } = await setup();
      const toggle = screen.getByRole('button', { name: /Switch to (dark|light) mode/ });
      const target = /dark/.test(toggle.getAttribute('aria-label')!) ? 'dark' : 'light';
      fireEvent.click(toggle);
      await waitFor(async () => expect((await repo.getSettings()).theme).toBe(target));
      await waitFor(() => expect(document.documentElement.dataset.theme).toBe(target));
    });
  });

  describe('install the app', () => {
    it('shows the install card with manual steps until the browser offers one-tap install', async () => {
      await setup();
      const card = within(screen.getByTestId('install-card'));
      expect(card.getByRole('link', { name: 'How to install' })).toHaveAttribute(
        'href',
        '#/install',
      );

      const prompt = vi.fn().mockResolvedValue(undefined);
      const ev = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt,
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(ev);
      fireEvent.click(await card.findByRole('button', { name: 'Install' }));
      await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
      expect(await screen.findByTestId('live')).toHaveTextContent('Installed');
    });

    it('"Not now" hides the card and remembers it', async () => {
      const { repo } = await setup();
      fireEvent.click(
        within(screen.getByTestId('install-card')).getByRole('button', { name: 'Not now' }),
      );
      await waitFor(() => expect(screen.queryByTestId('install-card')).toBeNull());
      expect((await repo.getSettings()).installCardDismissed).toBe(true);
    });

    it('install screen shows Android and iPhone steps when no prompt is available', async () => {
      await setup();
      await go('#/install');
      expect(await screen.findByTestId('android-steps')).toHaveTextContent('Install app');
      expect(screen.getByTestId('ios-steps')).toHaveTextContent('Add to Home Screen');
    });
  });

  it('shows no connection label while online, and a small Offline tag only while offline', async () => {
    await setup();
    expect(screen.queryByText(/saved on device/i)).toBeNull();
    expect(screen.queryByText('Offline')).toBeNull();
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    expect(await screen.findByText('Offline')).toBeInTheDocument();
    onLine.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(screen.queryByText('Offline')).toBeNull());
    onLine.mockRestore();
  });
});
