import { createSubmitGuard } from './submitGuard';

describe('createSubmitGuard', () => {
  it('runs the action once while a previous run is in flight', async () => {
    const guard = createSubmitGuard();
    let calls = 0;
    let release!: () => void;
    const action = () =>
      new Promise<void>((resolve) => {
        calls++;
        release = resolve;
      });
    const first = guard.run(action);
    const second = guard.run(action);
    const third = guard.run(action);
    expect(guard.busy).toBe(true);
    release();
    expect(await first).toEqual({ ran: true, value: undefined });
    expect(await second).toEqual({ ran: false });
    expect(await third).toEqual({ ran: false });
    expect(calls).toBe(1);
    expect(guard.busy).toBe(false);
  });

  it('allows a new run after the previous one fails', async () => {
    const guard = createSubmitGuard();
    await expect(guard.run(() => Promise.reject(new Error('disk full')))).rejects.toThrow(
      'disk full',
    );
    expect(guard.busy).toBe(false);
    expect(await guard.run(async () => 42)).toEqual({ ran: true, value: 42 });
  });
});
