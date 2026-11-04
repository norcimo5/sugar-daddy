import { createInstallController, isIosUa } from './install';

class FakeWin extends EventTarget {
  standaloneMatch = false;
  navigator: { userAgent: string; maxTouchPoints: number; standalone?: boolean } = {
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130',
    maxTouchPoints: 5,
  };
  matchMedia = (q: string) => ({ matches: q.includes('standalone') && this.standaloneMatch });
}

function promptEvent(outcome: 'accepted' | 'dismissed') {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome });
  return e;
}

describe('install controller', () => {
  it('starts in manual mode on Android until Chrome offers the prompt', () => {
    const win = new FakeWin();
    const c = createInstallController(win as never);
    expect(c.mode()).toBe('manual');
    const e = promptEvent('accepted');
    win.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true); // we show our own button instead of the mini-infobar
    expect(c.mode()).toBe('prompt');
  });

  it('promptInstall opens the dialog once and reports acceptance', async () => {
    const win = new FakeWin();
    const c = createInstallController(win as never);
    const e = promptEvent('accepted');
    win.dispatchEvent(e);
    const seen: string[] = [];
    c.subscribe(() => seen.push(c.mode()));
    expect(await c.promptInstall()).toBe(true);
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(await c.promptInstall()).toBe(false); // the event can only be used once
    expect(seen.length).toBeGreaterThan(0);
  });

  it('reports a dismissed dialog as not installed', async () => {
    const win = new FakeWin();
    const c = createInstallController(win as never);
    win.dispatchEvent(promptEvent('dismissed'));
    expect(await c.promptInstall()).toBe(false);
  });

  it('is "installed" when running standalone, and after appinstalled', () => {
    const win = new FakeWin();
    win.standaloneMatch = true;
    expect(createInstallController(win as never).mode()).toBe('installed');
    const win2 = new FakeWin();
    const c2 = createInstallController(win2 as never);
    win2.dispatchEvent(promptEvent('accepted'));
    win2.dispatchEvent(new Event('appinstalled'));
    expect(c2.mode()).toBe('installed');
  });

  it('detects iPhone/iPad Safari (including iPadOS reporting as Mac) and iOS standalone', () => {
    const win = new FakeWin();
    win.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1',
      maxTouchPoints: 5,
    };
    expect(createInstallController(win as never).mode()).toBe('ios');
    win.navigator = { ...win.navigator, standalone: true };
    expect(createInstallController(win as never).mode()).toBe('installed');
    expect(isIosUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)).toBe(true);
    expect(isIosUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0)).toBe(false);
  });
});
