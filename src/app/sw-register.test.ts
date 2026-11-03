import { registerServiceWorker } from './sw-register';

class FakeWorker extends EventTarget {
  state = 'installing';
  postMessage = vi.fn();
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
}

class FakeContainer extends EventTarget {
  controller: object | null = {};
  registration = new FakeRegistration();
  register = vi.fn(() => Promise.resolve(this.registration));
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('registerServiceWorker', () => {
  let container: FakeContainer;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('DEV', false);
    container = new FakeContainer();
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
    reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it('does nothing in dev', async () => {
    vi.stubEnv('DEV', true);
    registerServiceWorker(vi.fn());
    await flush();
    expect(container.register).not.toHaveBeenCalled();
  });

  it('does nothing when service workers are unsupported', () => {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    expect(() => registerServiceWorker(vi.fn())).not.toThrow();
  });

  it('registers /sw.js with root scope', async () => {
    registerServiceWorker(vi.fn());
    await flush();
    expect(container.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('reports an already-waiting worker, and apply posts SKIP_WAITING then reloads once', async () => {
    const waiting = new FakeWorker();
    container.registration.waiting = waiting;
    const onUpdate = vi.fn();
    registerServiceWorker(onUpdate);
    await flush();
    expect(onUpdate).toHaveBeenCalledTimes(1);

    const apply = onUpdate.mock.calls[0]?.[0] as () => void;
    apply();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reports a newly installed worker when a controller already exists', async () => {
    const onUpdate = vi.fn();
    registerServiceWorker(onUpdate);
    await flush();
    const installing = new FakeWorker();
    container.registration.installing = installing;
    container.registration.dispatchEvent(new Event('updatefound'));
    installing.state = 'installed';
    installing.dispatchEvent(new Event('statechange'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not report the very first install (no controller)', async () => {
    container.controller = null;
    const onUpdate = vi.fn();
    registerServiceWorker(onUpdate);
    await flush();
    const installing = new FakeWorker();
    container.registration.installing = installing;
    container.registration.dispatchEvent(new Event('updatefound'));
    installing.state = 'installed';
    installing.dispatchEvent(new Event('statechange'));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('warns without throwing when registration fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    container.register.mockImplementationOnce(() => Promise.reject(new Error('boom secret')));
    registerServiceWorker(vi.fn());
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('boom secret');
    warn.mockRestore();
  });
});
