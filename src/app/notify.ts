import type { SlotState } from '../domain/reminders';

export type NotificationSupport = 'unsupported' | NotificationPermission;

export function notificationSupport(
  scope: { Notification?: { permission: NotificationPermission } } = globalThis as never,
): NotificationSupport {
  return scope.Notification ? scope.Notification.permission : 'unsupported';
}

/** Ask for permission. Call ONLY from an explicit user action. */
export async function requestNotificationPermission(): Promise<NotificationSupport> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

/** Notification text never includes health values. */
export function reminderNotificationText(metricShortName: string) {
  return { title: 'Sugar Daddy', body: `Time to log your ${metricShortName}.` };
}

/** Pure: returns due slots not yet notified and records them as fired. */
export function slotsToNotify(due: SlotState[], fired: Set<string>): SlotState[] {
  const out: SlotState[] = [];
  for (const s of due) {
    const key = `${s.reminder.id}@${s.date}`;
    if (fired.has(key)) continue;
    fired.add(key);
    out.push(s);
  }
  return out;
}

export async function showNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (notificationSupport() !== 'granted') return false;
  const options: NotificationOptions = { body, tag, icon: '/icons/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
    new Notification(title, options);
    return true;
  } catch {
    console.warn('Sugar Daddy: notification could not be shown.');
    return false;
  }
}

const FIRED_KEY = 'sugar-daddy.notified';
type KeyStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/**
 * Which reminder slots were already notified, so a reload never re-notifies.
 * Holds only `${reminderId}@${date}` keys — no health data. Browser storage is a
 * convenience here; if it is unavailable we fall back to in-memory only.
 */
export function loadFired(storage: KeyStore | undefined, today: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(FIRED_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((k): k is string => typeof k === 'string' && k.endsWith(`@${today}`)),
    );
  } catch {
    return new Set();
  }
}

export function saveFired(storage: KeyStore | undefined, fired: Set<string>): void {
  try {
    storage?.setItem(FIRED_KEY, JSON.stringify([...fired]));
  } catch {
    // Storage blocked (private mode etc.): keep the in-memory set only.
  }
}
