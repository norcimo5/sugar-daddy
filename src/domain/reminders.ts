/**
 * Pure reminder-slot evaluation (FR-R). No clock access: `now` is always passed in.
 *
 * Status precedence for a slot: satisfied > dismissed > (upcoming | due | missed by time).
 *
 * Satisfaction is deliberately simple: any reading of the same metric with takenAt in
 * [dueAt − SATISFY_LOOKBACK_MINUTES, graceEndsAt] satisfies the slot, so one reading may
 * satisfy two close slots (e.g. 08:00 and 09:00 both satisfied by an 08:30 reading).
 *
 * DST: dueAt is built from local wall-clock fields with `new Date(y, m, d, h, mi)`. A time that
 * does not exist on spring-forward day (e.g. 02:30) is normalised by Date (to 03:30 local
 * daylight time in America/New_York); an ambiguous fall-back time resolves to the first
 * occurrence. graceEndsAt is dueAt plus graceMinutes of elapsed time.
 */
import type { Dismissal, Measurement, Reminder } from './types';
import { addLocalDays, localDateKey, startOfLocalDay } from './time';

export type SlotStatus = 'upcoming' | 'due' | 'satisfied' | 'missed' | 'dismissed';

export interface SlotState {
  reminder: Reminder;
  date: string;
  dueAt: Date;
  graceEndsAt: Date;
  status: SlotStatus;
  satisfiedBy?: string;
}

export const SATISFY_LOOKBACK_MINUTES = 120;

const MINUTE_MS = 60_000;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHHMM(s: string): { h: number; m: number } | null {
  const match = HHMM_RE.exec(s);
  if (!match) return null;
  return { h: Number(match[1]), m: Number(match[2]) };
}

export function dismissalId(reminderId: string, date: string): string {
  return `${reminderId}@${date}`;
}

interface Timed {
  reminder: Reminder;
  hm: { h: number; m: number };
}

function slotTimes(day: Date, hm: { h: number; m: number }, graceMinutes: number) {
  const dueAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hm.h, hm.m);
  const graceEndsAt = new Date(dueAt.getTime() + graceMinutes * MINUTE_MS);
  return { dueAt, graceEndsAt };
}

function byDueAt(a: SlotState, b: SlotState): number {
  return a.dueAt.getTime() - b.dueAt.getTime() || (a.reminder.id < b.reminder.id ? -1 : 1);
}

export function evaluateReminders(args: {
  now: Date;
  reminders: Reminder[];
  measurements: Measurement[];
  dismissals: Dismissal[];
  graceMinutes: number;
}): { today: SlotState[]; missed: SlotState[]; due: SlotState[]; next: SlotState | null } {
  const { now, reminders, measurements, dismissals, graceMinutes } = args;
  const nowMs = now.getTime();
  const today = startOfLocalDay(now);
  const todayKey = localDateKey(today);
  const dismissed = new Set(dismissals.map((d) => d.id));

  const timed: Timed[] = [];
  for (const reminder of reminders) {
    if (!reminder.enabled) continue;
    const hm = parseHHMM(reminder.time);
    if (hm) timed.push({ reminder, hm });
  }

  const readings = measurements
    .map((m) => ({ id: m.id, metricId: m.metricId, t: Date.parse(m.takenAt) }))
    .filter((r) => !Number.isNaN(r.t))
    .sort((a, b) => a.t - b.t);

  const todaySlots: SlotState[] = timed.map(({ reminder, hm }) => {
    const { dueAt, graceEndsAt } = slotTimes(today, hm, graceMinutes);
    const from = dueAt.getTime() - SATISFY_LOOKBACK_MINUTES * MINUTE_MS;
    const to = graceEndsAt.getTime();
    const hit = readings.find((r) => r.metricId === reminder.metricId && r.t >= from && r.t <= to);
    const base = { reminder, date: todayKey, dueAt, graceEndsAt };
    if (hit) return { ...base, status: 'satisfied', satisfiedBy: hit.id };
    if (dismissed.has(dismissalId(reminder.id, todayKey))) return { ...base, status: 'dismissed' };
    if (nowMs < dueAt.getTime()) return { ...base, status: 'upcoming' };
    if (nowMs <= to) return { ...base, status: 'due' };
    return { ...base, status: 'missed' };
  });
  todaySlots.sort(byDueAt);

  let next: SlotState | null = todaySlots.find((s) => s.status === 'upcoming') ?? null;
  if (!next) {
    const tomorrow = addLocalDays(today, 1);
    const tomorrowKey = localDateKey(tomorrow);
    const candidates: SlotState[] = timed.map(({ reminder, hm }) => ({
      reminder,
      date: tomorrowKey,
      ...slotTimes(tomorrow, hm, graceMinutes),
      status: 'upcoming',
    }));
    next = candidates.sort(byDueAt)[0] ?? null;
  }

  return {
    today: todaySlots,
    missed: todaySlots.filter((s) => s.status === 'missed'),
    due: todaySlots.filter((s) => s.status === 'due'),
    next,
  };
}
