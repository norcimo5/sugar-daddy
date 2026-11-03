import { slotsToNotify, notificationSupport, reminderNotificationText } from './notify';

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
