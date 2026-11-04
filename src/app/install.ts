/**
 * "Install app" support for both phone platforms (same approach as florida-test-webapp):
 *  - Android (Chrome, Edge, Samsung Internet): the browser fires `beforeinstallprompt`; we keep
 *    it and show our own Install button that opens the browser's install dialog in one tap.
 *  - iPhone/iPad (Safari): there is no install API, so we show guided Share → Add to Home
 *    Screen steps.
 *  - Already running as an installed app: nothing to show.
 */
import { useEffect, useState } from 'preact/hooks';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'installed' | 'prompt' | 'ios' | 'manual';

interface InstallWindow extends EventTarget {
  navigator: { userAgent: string; maxTouchPoints: number; standalone?: boolean };
  matchMedia?(query: string): { matches: boolean };
}

/** iPhone/iPad, including iPadOS that reports itself as a Mac. */
export function isIosUa(ua: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && maxTouchPoints > 1);
}

export function createInstallController(win: InstallWindow) {
  let deferred: BeforeInstallPromptEvent | null = null;
  let installed = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // no mini-infobar; our own button opens the dialog
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  win.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });

  const standalone = () =>
    win.matchMedia?.('(display-mode: standalone)').matches === true ||
    win.navigator.standalone === true;

  return {
    mode(): InstallMode {
      if (installed || standalone()) return 'installed';
      if (deferred) return 'prompt';
      if (isIosUa(win.navigator.userAgent, win.navigator.maxTouchPoints)) return 'ios';
      return 'manual';
    },
    subscribe(l: () => void): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** Opens the browser's install dialog. Only call from a user tap. True if accepted. */
    async promptInstall(): Promise<boolean> {
      if (!deferred) return false;
      const ev = deferred;
      deferred = null;
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      notify();
      return outcome === 'accepted';
    },
  };
}

export type InstallController = ReturnType<typeof createInstallController>;

let shared: InstallController | null = null;

/** Call once at startup, before rendering, so the early browser event is not missed. */
export function initInstall(win: InstallWindow = window): InstallController {
  shared ??= createInstallController(win);
  return shared;
}

/** Hook: current install mode; updates when the browser makes the prompt available. */
export function useInstall(): { mode: InstallMode; promptInstall(): Promise<boolean> } {
  const c = initInstall();
  const [mode, setMode] = useState(c.mode());
  useEffect(() => {
    setMode(c.mode());
    return c.subscribe(() => setMode(c.mode()));
  }, [c]);
  return { mode, promptInstall: c.promptInstall };
}
