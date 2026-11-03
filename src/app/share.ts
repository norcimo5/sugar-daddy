export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable';

interface ShareEnv {
  share?: (data: { title: string; text: string }) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
}

function defaultEnv(): ShareEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    share: nav?.share ? (d) => nav.share(d) : undefined,
    clipboard: nav?.clipboard,
  };
}

/**
 * Only ever called from an explicit user tap. Opens the system share sheet when the
 * browser has one; otherwise copies the text so the user can paste it themselves.
 */
export async function shareOrCopy(
  text: string,
  env: ShareEnv = defaultEnv(),
): Promise<ShareOutcome> {
  if (env.share) {
    try {
      await env.share({ title: 'Sugar Daddy', text });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
    }
  }
  if (env.clipboard) {
    try {
      await env.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'unavailable';
    }
  }
  return 'unavailable';
}
