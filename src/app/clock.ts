export interface Clock {
  now(): Date;
}

/**
 * Injectable clock. Tests and e2e runs can fix the starting instant
 * (`window.__SD_NOW__ = '<ISO>'`); time then advances normally from there.
 */
export function createClock(opts: { fixedStart?: string; realNow?: () => number } = {}): Clock {
  const realNow = opts.realNow ?? (() => Date.now());
  const fixed = opts.fixedStart ? Date.parse(opts.fixedStart) : NaN;
  if (Number.isNaN(fixed)) return { now: () => new Date(realNow()) };
  const offset = fixed - realNow();
  return { now: () => new Date(realNow() + offset) };
}

declare global {
  interface Window {
    __SD_NOW__?: string;
  }
}

export const appClock: Clock = createClock({
  fixedStart: typeof window !== 'undefined' ? window.__SD_NOW__ : undefined,
});
