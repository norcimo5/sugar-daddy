import {
  slotsToNotify,
  notificationSupport,
  reminderNotificationText,
  loadFired,
  saveFired,
} from './notify';

const slot = (reminderId: string, date: string) =>
  ({ reminder: { id: reminderId }, date }) as unknown as Parameters<
    typeof slotsToNotify
  >[0][number];

describe('slotsToNotify', () => {
  it('returns each due slot only once', () => {
    const fired = new Set<string>();
    const due = [slot('a', '2026-11-03'), slot('b', '2026-11-03')];
    expect(slotsToNotify(due, fired).map((s) => s.reminder.id)).toEqual(['a', 'b']);
    expect(slotsToNotify(due, fired)).toEqual([]);
  });

  it('treats the same reminder on another day as new', () => {
    const fired = new Set<string>(['a@2026-11-03']);
    expect(slotsToNotify([slot('a', '2026-11-04')], fired)).toHaveLength(1);
  });
});

describe('notificationSupport', () => {
  it('reports unsupported when the API is missing', () => {
    expect(notificationSupport({})).toBe('unsupported');
  });
  it('reports the permission state when present', () => {
    expect(notificationSupport({ Notification: { permission: 'granted' } })).toBe('granted');
  });
});

describe('reminderNotificationText', () => {
  it('never contains a reading value, only the metric name', () => {
    expect(reminderNotificationText('glucose')).toEqual({
      title: 'Sugar Daddy',
      body: 'Time to log your glucose.',
    });
  });
});

describe('fired-notification memory', () => {
  function memoryStorage() {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  }

  it('survives a reload so a due slot is not notified twice', () => {
    const storage = memoryStorage();
    const fired = loadFired(storage, '2026-11-03');
    slotsToNotify([slot('a', '2026-11-03')], fired);
    saveFired(storage, fired);
    const again = loadFired(storage, '2026-11-03');
    expect(slotsToNotify([slot('a', '2026-11-03')], again)).toEqual([]);
  });

  it('forgets keys from earlier days and tolerates broken storage', () => {
    const storage = memoryStorage();
    saveFired(storage, new Set(['a@2026-11-01', 'b@2026-11-03']));
    expect([...loadFired(storage, '2026-11-03')]).toEqual(['b@2026-11-03']);
    storage.setItem('sugar-daddy.notified', '{not json');
    expect(loadFired(storage, '2026-11-03').size).toBe(0);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadFired(throwing, '2026-11-03').size).toBe(0);
    expect(() => saveFired(throwing, new Set(['x@2026-11-03']))).not.toThrow();
  });
});
