/**
 * Registers the service worker and reports when an update is waiting.
 * The new worker never takes over on its own: `apply` asks it to skip waiting, then the
 * page reloads once when it becomes the controller.
 */
export function registerServiceWorker(onUpdate: (apply: () => void) => void): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const container = navigator.serviceWorker;

  const report = (worker: ServiceWorker): void => {
    onUpdate(() => {
      let reloaded = false;
      container.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  };

  container
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then((registration) => {
      if (registration.waiting && container.controller) report(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // With no controller this is the first install, not an update.
          if (installing.state === 'installed' && container.controller) report(installing);
        });
      });
    })
    .catch(() => {
      console.warn('Service worker registration failed');
    });
}
