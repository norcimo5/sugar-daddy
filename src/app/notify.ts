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
