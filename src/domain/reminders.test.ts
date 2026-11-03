import { describe, it, expect } from 'vitest';
import type { Dismissal, Measurement, Reminder } from './types';
import {
  parseHHMM,
  dismissalId,
  evaluateReminders,
  SATISFY_LOOKBACK_MINUTES,
  type SlotState,
} from './reminders';

const local = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s);
const MIN = 60_000;

function reminder(id: string, time: string, metricId = 'glucose', enabled = true): Reminder {
  return { id, time, metricId, enabled, createdAt: '', updatedAt: '' };
}

function reading(id: string, takenAt: Date, metricId = 'glucose'): Measurement {
  return {
    id,
    metricId,
    value: { value: 100 },
    raw: { value: '100' },
    unit: 'mg/dL',
    takenAt: takenAt.toISOString(),
    timeZone: 'America/New_York',
    source: 'manual',
    createdAt: '',
    updatedAt: '',
  };
}

function dismissal(reminderId: string, date: string): Dismissal {
  return { id: dismissalId(reminderId, date), reminderId, date, createdAt: '' };
}

function evaluate(
  now: Date,
  reminders: Reminder[],
  measurements: Measurement[] = [],
  dismissals: Dismissal[] = [],
  graceMinutes = 60,
) {
  return evaluateReminders({ now, reminders, measurements, dismissals, graceMinutes });
}

const only = (slots: SlotState[]): SlotState => {
  expect(slots).toHaveLength(1);
  return slots[0] as SlotState;
};

describe('parseHHMM', () => {
  it('parses valid 24h times', () => {
    expect(parseHHMM('00:00')).toEqual({ h: 0, m: 0 });
    expect(parseHHMM('08:05')).toEqual({ h: 8, m: 5 });
    expect(parseHHMM('23:59')).toEqual({ h: 23, m: 59 });
  });

  it.each(['', '8:05', '24:00', '12:60', '12:5', 'ab:cd', '12-30', ' 12:30', '12:30:00', '-1:30'])(
    'rejects %j',
    (s) => {
      expect(parseHHMM(s)).toBeNull();
    },
  );
});

describe('dismissalId', () => {
  it('is `${reminderId}@${date}`', () => {
    expect(dismissalId('r1', '2026-11-03')).toBe('r1@2026-11-03');
  });
});

describe('SATISFY_LOOKBACK_MINUTES', () => {
  it('is 120', () => {
    expect(SATISFY_LOOKBACK_MINUTES).toBe(120);
  });
});

describe('evaluateReminders: slot construction', () => {
  it("builds today's slot with dueAt at local wall time and grace end", () => {
    const now = local(2026, 11, 3, 6, 0);
    const s = only(evaluate(now, [reminder('r1', '08:00')]).today);
    expect(s.date).toBe('2026-11-03');
    expect(s.dueAt.getTime()).toBe(local(2026, 11, 3, 8, 0).getTime());
    expect(s.graceEndsAt.getTime()).toBe(local(2026, 11, 3, 9, 0).getTime());
    expect(s.reminder.id).toBe('r1');
  });

  it('respects graceMinutes', () => {
    const now = local(2026, 11, 3, 6, 0);
    const s = only(evaluate(now, [reminder('r1', '08:00')], [], [], 15).today);
    expect(s.graceEndsAt.getTime() - s.dueAt.getTime()).toBe(15 * MIN);
  });

  it('excludes disabled reminders entirely', () => {
    const now = local(2026, 11, 3, 12, 0);
    const r = evaluate(now, [reminder('off', '08:00', 'glucose', false)]);
    expect(r.today).toEqual([]);
    expect(r.missed).toEqual([]);
    expect(r.due).toEqual([]);
    expect(r.next).toBeNull();
  });

  it('skips reminders with malformed time without throwing', () => {
    const now = local(2026, 11, 3, 6, 0);
    const r = evaluate(now, [
      reminder('bad', '25:99'),
      reminder('bad2', 'nope'),
      reminder('ok', '08:00'),
    ]);
    expect(r.today.map((s) => s.reminder.id)).toEqual(['ok']);
  });

  it('sorts today by dueAt regardless of input order', () => {
    const now = local(2026, 11, 3, 0, 30);
    const r = evaluate(now, [
      reminder('c', '20:00'),
      reminder('a', '07:30'),
      reminder('b', '12:00', 'blood_pressure'),
    ]);
    expect(r.today.map((s) => s.reminder.id)).toEqual(['a', 'b', 'c']);
  });

  it('empty input yields empty result', () => {
    expect(evaluate(local(2026, 11, 3, 12), [])).toEqual({
      today: [],
      missed: [],
      due: [],
      next: null,
    });
  });
});

describe('evaluateReminders: status transitions', () => {
  const r1 = reminder('r1', '08:00');

  it('upcoming before dueAt', () => {
    expect(only(evaluate(local(2026, 11, 3, 7, 59, 59), [r1]).today).status).toBe('upcoming');
  });

  it('due exactly at dueAt', () => {
    const res = evaluate(local(2026, 11, 3, 8, 0), [r1]);
    expect(only(res.today).status).toBe('due');
    expect(only(res.due).reminder.id).toBe('r1');
  });

  it('still due exactly at graceEndsAt', () => {
    const res = evaluate(local(2026, 11, 3, 9, 0), [r1]);
    expect(only(res.today).status).toBe('due');
  });

  it('missed just after graceEndsAt', () => {
    const now = new Date(local(2026, 11, 3, 9, 0).getTime() + 1);
    const res = evaluate(now, [r1]);
    expect(only(res.today).status).toBe('missed');
    expect(only(res.missed).reminder.id).toBe('r1');
    expect(res.due).toEqual([]);
  });
});

describe('evaluateReminders: satisfaction', () => {
  const r1 = reminder('r1', '08:00');
  const later = local(2026, 11, 3, 12, 0);

  it('satisfied by a reading inside the window, recording satisfiedBy', () => {
    const s = only(evaluate(later, [r1], [reading('m1', local(2026, 11, 3, 8, 20))]).today);
    expect(s.status).toBe('satisfied');
    expect(s.satisfiedBy).toBe('m1');
  });

  it('satisfied by a reading exactly at dueAt − 120 min', () => {
    const s = only(evaluate(later, [r1], [reading('m1', local(2026, 11, 3, 6, 0))]).today);
    expect(s.status).toBe('satisfied');
  });

  it('not satisfied by a reading 1 ms before the lookback edge', () => {
    const t = new Date(local(2026, 11, 3, 6, 0).getTime() - 1);
    const s = only(evaluate(later, [r1], [reading('m1', t)]).today);
    expect(s.status).toBe('missed');
    expect(s.satisfiedBy).toBeUndefined();
  });

  it('satisfied by a reading exactly at graceEndsAt', () => {
    const s = only(evaluate(later, [r1], [reading('m1', local(2026, 11, 3, 9, 0))]).today);
    expect(s.status).toBe('satisfied');
  });

  it('not satisfied by a reading 1 ms after graceEndsAt', () => {
    const t = new Date(local(2026, 11, 3, 9, 0).getTime() + 1);
    const s = only(evaluate(later, [r1], [reading('m1', t)]).today);
    expect(s.status).toBe('missed');
  });

  it('not satisfied by a reading of a different metric', () => {
    const s = only(
      evaluate(later, [r1], [reading('bp', local(2026, 11, 3, 8, 10), 'blood_pressure')]).today,
    );
    expect(s.status).toBe('missed');
  });

  it('an early reading satisfies an upcoming slot before dueAt', () => {
    const now = local(2026, 11, 3, 7, 30);
    const s = only(evaluate(now, [r1], [reading('m1', local(2026, 11, 3, 7, 0))]).today);
    expect(s.status).toBe('satisfied');
  });

  it('a satisfied slot is in neither missed nor due', () => {
    const res = evaluate(
      local(2026, 11, 3, 8, 30),
      [r1],
      [reading('m1', local(2026, 11, 3, 8, 5))],
    );
    expect(res.due).toEqual([]);
    expect(res.missed).toEqual([]);
  });

  it('ignores measurements with an unparseable takenAt', () => {
    const bad = { ...reading('m1', local(2026, 11, 3, 8, 5)), takenAt: 'garbage' };
    expect(only(evaluate(later, [r1], [bad]).today).status).toBe('missed');
  });

  it('one reading may satisfy two close slots (documented behaviour)', () => {
    const res = evaluate(
      later,
      [reminder('a', '08:00'), reminder('b', '09:00')],
      [reading('m1', local(2026, 11, 3, 8, 30))],
    );
    expect(res.today.map((s) => [s.reminder.id, s.status, s.satisfiedBy])).toEqual([
      ['a', 'satisfied', 'm1'],
      ['b', 'satisfied', 'm1'],
    ]);
  });

  it('picks the earliest qualifying reading as satisfiedBy', () => {
    const s = only(
      evaluate(
        later,
        [r1],
        [reading('late', local(2026, 11, 3, 8, 50)), reading('early', local(2026, 11, 3, 7, 10))],
      ).today,
    );
    expect(s.satisfiedBy).toBe('early');
  });
});

describe('evaluateReminders: dismissals', () => {
  const r1 = reminder('r1', '08:00');

  it('dismissed takes precedence over missed', () => {
    const res = evaluate(local(2026, 11, 3, 12), [r1], [], [dismissal('r1', '2026-11-03')]);
    expect(only(res.today).status).toBe('dismissed');
    expect(res.missed).toEqual([]);
  });

  it('dismissed takes precedence over due', () => {
    const res = evaluate(local(2026, 11, 3, 8, 15), [r1], [], [dismissal('r1', '2026-11-03')]);
    expect(only(res.today).status).toBe('dismissed');
    expect(res.due).toEqual([]);
  });

  it('dismissed takes precedence over upcoming and is not next', () => {
    const res = evaluate(local(2026, 11, 3, 6), [r1], [], [dismissal('r1', '2026-11-03')]);
    expect(only(res.today).status).toBe('dismissed');
    expect(res.next?.date).toBe('2026-11-04');
  });

  it('satisfied wins over dismissed', () => {
    const res = evaluate(
      local(2026, 11, 3, 12),
      [r1],
      [reading('m1', local(2026, 11, 3, 8, 0))],
      [dismissal('r1', '2026-11-03')],
    );
    expect(only(res.today).status).toBe('satisfied');
  });

  it('a dismissal for another date or reminder has no effect', () => {
    const res = evaluate(
      local(2026, 11, 3, 12),
      [r1],
      [],
      [dismissal('r1', '2026-11-02'), dismissal('r2', '2026-11-03')],
    );
    expect(only(res.today).status).toBe('missed');
  });

  it('matches by dismissal id', () => {
    const d: Dismissal = {
      id: 'r1@2026-11-03',
      reminderId: 'r1',
      date: '2026-11-03',
      createdAt: '',
    };
    expect(only(evaluate(local(2026, 11, 3, 12), [r1], [], [d]).today).status).toBe('dismissed');
  });
});

describe('evaluateReminders: next', () => {
  it('is the earliest upcoming slot today', () => {
    const res = evaluate(local(2026, 11, 3, 10), [
      reminder('a', '08:00'),
      reminder('c', '20:00'),
      reminder('b', '12:00'),
    ]);
    expect(res.next?.reminder.id).toBe('b');
    expect(res.next?.status).toBe('upcoming');
    expect(res.next?.date).toBe('2026-11-03');
  });

  it('skips today slots that are satisfied early', () => {
    const res = evaluate(
      local(2026, 11, 3, 10),
      [reminder('b', '12:00'), reminder('c', '20:00')],
      [reading('m1', local(2026, 11, 3, 11, 0))],
    );
    expect(res.next?.reminder.id).toBe('c');
  });

  it('falls back to the earliest enabled reminder tomorrow', () => {
    const res = evaluate(local(2026, 11, 3, 22), [
      reminder('late', '20:00'),
      reminder('early', '07:00'),
      reminder('off', '05:00', 'glucose', false),
      reminder('bad', 'xx:yy'),
    ]);
    const n = res.next as SlotState;
    expect(n.reminder.id).toBe('early');
    expect(n.date).toBe('2026-11-04');
    expect(n.status).toBe('upcoming');
    expect(n.dueAt.getTime()).toBe(local(2026, 11, 4, 7, 0).getTime());
    expect(n.graceEndsAt.getTime()).toBe(local(2026, 11, 4, 8, 0).getTime());
  });

  it('tomorrow across fall back keeps wall-clock time', () => {
    const n = evaluate(local(2026, 10, 31, 22), [reminder('r', '08:00')]).next as SlotState;
    expect(n.date).toBe('2026-11-01');
    expect(n.dueAt.toISOString()).toBe('2026-11-01T13:00:00.000Z'); // 08:00 EST
  });

  it('tomorrow across month and year boundary', () => {
    const n = evaluate(local(2026, 12, 31, 23, 0), [reminder('r', '06:00')]).next as SlotState;
    expect(n.date).toBe('2027-01-01');
  });
});

describe('evaluateReminders: midnight boundaries', () => {
  it('a 00:00 reminder is due at local midnight', () => {
    const res = evaluate(local(2026, 11, 3, 0, 0), [reminder('mid', '00:00')]);
    expect(only(res.today).status).toBe('due');
    expect(only(res.today).date).toBe('2026-11-03');
  });

  it('lookback for a 00:30 slot reaches into the previous day', () => {
    const s = only(
      evaluate(
        local(2026, 11, 3, 3, 0),
        [reminder('r', '00:30')],
        [reading('m1', local(2026, 11, 2, 23, 0))],
      ).today,
    );
    expect(s.status).toBe('satisfied');
  });

  it('a 23:30 slot grace window extends past midnight; at 00:10 today is the new day', () => {
    // At 23:59 on Nov 3 the slot is still due.
    const before = evaluate(local(2026, 11, 3, 23, 59), [reminder('r', '23:30')]);
    expect(only(before.today).status).toBe('due');
    // After midnight, evaluation is for Nov 4's slot (upcoming); Nov 3 is no longer "today".
    const after = evaluate(local(2026, 11, 4, 0, 10), [reminder('r', '23:30')]);
    expect(only(after.today).date).toBe('2026-11-04');
    expect(only(after.today).status).toBe('upcoming');
  });
});

describe('evaluateReminders: DST', () => {
  it('02:30 on spring-forward day does not throw and is normalised by Date to 03:30 EDT', () => {
    const now = local(2026, 3, 8, 1, 0);
    const s = only(evaluate(now, [reminder('gap', '02:30')]).today);
    expect(s.date).toBe('2026-03-08');
    expect(s.dueAt.toISOString()).toBe('2026-03-08T07:30:00.000Z'); // 03:30 EDT
    expect(s.status).toBe('upcoming');
  });

  it('spring-forward day: 08:00 slot is at 08:00 EDT', () => {
    const s = only(evaluate(local(2026, 3, 8, 1, 0), [reminder('r', '08:00')]).today);
    expect(s.dueAt.toISOString()).toBe('2026-03-08T12:00:00.000Z');
  });

  it('fall-back day: 08:00 slot is at 08:00 EST and grace is a real-time duration', () => {
    const s = only(evaluate(local(2026, 11, 1, 0, 30), [reminder('r', '08:00')]).today);
    expect(s.dueAt.toISOString()).toBe('2026-11-01T13:00:00.000Z');
    expect(s.graceEndsAt.getTime() - s.dueAt.getTime()).toBe(60 * MIN);
  });

  it('fall-back day: grace across the repeated 01:xx hour is elapsed time', () => {
    // 01:00 is resolved by Date to the first (EDT) occurrence; grace 90 min ends 01:30 EST.
    const s = only(evaluate(local(2026, 11, 1, 0, 30), [reminder('r', '01:00')], [], [], 90).today);
    expect(s.dueAt.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(s.graceEndsAt.toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });
});
