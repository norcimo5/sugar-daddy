import { useState } from 'preact/hooks';
import { useApp } from '../../context';
import {
  notificationSupport,
  requestNotificationPermission,
  showNotification,
  type NotificationSupport,
} from '../../../app/notify';

const STATUS_TEXT: Record<NotificationSupport, string> = {
  unsupported: 'This browser does not support notifications.',
  default: 'Not turned on.',
  granted: 'Off. (Your browser allows notifications.)',
  denied: 'Blocked in your browser or phone settings.',
};

export function NotificationSettings() {
  const app = useApp();
  const [support, setSupport] = useState<NotificationSupport>(() => notificationSupport());
  const on = app.settings.notificationsEnabled && support === 'granted';

  async function enable() {
    try {
      const result = await requestNotificationPermission();
      setSupport(result);
      if (result === 'granted') {
        await app.actions.saveSettings({ notificationsEnabled: true });
        app.toast('Notifications turned on.');
      } else {
        app.toast('Notifications were not allowed.', 'error');
      }
    } catch (e) {
      app.toast(e instanceof Error ? e.message : 'Not saved.', 'error');
    }
  }

  return (
    <div class="card" data-testid="notification-settings">
      <h3 style={{ marginTop: 0 }}>Notifications</h3>
      <p>
        Status: <strong>{on ? 'On' : STATUS_TEXT[support]}</strong>
      </p>
      <p class="hint">
        Phones may only show reminder notifications while Sugar Daddy is open or recently used. On
        iPhone, the app must be added to the Home Screen (iOS 16.4 or later). The missed-reading
        note on the Today screen works either way.
      </p>
      {support === 'unsupported' || support === 'denied' ? null : on ? (
        <div class="btn-row">
          <button
            type="button"
            onClick={async () => {
              const ok = await showNotification(
                'Sugar Daddy',
                'This is a test notification.',
                'test',
              );
              app.toast(
                ok ? 'Test notification sent.' : 'Could not show a notification.',
                ok ? 'info' : 'error',
              );
            }}
          >
            Send test notification
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await app.actions.saveSettings({ notificationsEnabled: false });
                app.toast('Notifications turned off.');
              } catch (e) {
                app.toast(e instanceof Error ? e.message : 'Not saved.', 'error');
              }
            }}
          >
            Turn off
          </button>
        </div>
      ) : (
        <button type="button" class="btn-block" onClick={enable}>
          Turn on notifications
        </button>
      )}
    </div>
  );
}
