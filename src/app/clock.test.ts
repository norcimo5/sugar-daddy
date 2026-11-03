import { createClock } from './clock';

describe('createClock', () => {
  it('uses the real time by default', () => {
    const clock = createClock({ realNow: () => 1_000 });
    expect(clock.now().getTime()).toBe(1_000);
  });

  it('starts from an injected fixed instant and advances with real time', () => {
    let real = 5_000;
    const clock = createClock({ fixedStart: '2026-11-03T14:00:00.000Z', realNow: () => real });
    expect(clock.now().toISOString()).toBe('2026-11-03T14:00:00.000Z');
    real += 90_000;
    expect(clock.now().toISOString()).toBe('2026-11-03T14:01:30.000Z');
  });

  it('ignores an invalid injected instant', () => {
    const clock = createClock({ fixedStart: 'not a date', realNow: () => 7 });
    expect(clock.now().getTime()).toBe(7);
  });
});
