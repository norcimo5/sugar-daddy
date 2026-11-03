export type GuardResult<T> = { ran: true; value: T } | { ran: false };

/**
 * Prevents duplicate submissions from rapid repeated taps: while an action is in
 * flight, further calls resolve immediately with `{ ran: false }`.
 */
export function createSubmitGuard() {
  let inFlight = false;
  return {
    get busy() {
      return inFlight;
    },
    async run<T>(action: () => Promise<T>): Promise<GuardResult<T>> {
      if (inFlight) return { ran: false };
      inFlight = true;
      try {
        return { ran: true, value: await action() };
      } finally {
        inFlight = false;
      }
    },
  };
}
