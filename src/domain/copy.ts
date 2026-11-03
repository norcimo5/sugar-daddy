/**
 * User-facing copy. Playful lines appear only in low-stakes places (welcome, empty states,
 * success for in-range readings) and only when the playful tone is on. Concerning
 * statuses always get calm, plain wording.
 */
import type { StatusKind, Tone } from './types';

export const TAGLINE = 'Your glucose. Your rules.';

export const DISCLAIMER =
  "Sugar Daddy records and displays measurements. It does not provide medical advice. Follow your care team's instructions.";

export const CARE_TEAM_NOTE =
  "If you're in hospital, contact your nurse or care team with any concerns, symptoms, or questions about a reading.";

const SAVED = 'Reading saved.';

/**
 * Playful only for an in-range reading. 'unconfigured' stays plain: with no thresholds we
 * cannot know the reading is not concerning.
 */
export function savedMessage(tone: Tone, status: StatusKind): string {
  if (tone === 'playful' && status === 'in_range')
    return `${SAVED} Daddy says you're looking good.`;
  return SAVED;
}

export function welcomeMessage(tone: Tone): string {
  return tone === 'playful' ? `Welcome to Sugar Daddy. ${TAGLINE}` : 'Welcome to Sugar Daddy.';
}

export function emptyTodayMessage(tone: Tone): string {
  return tone === 'playful'
    ? "No readings yet today. Whenever you're ready, Daddy's listening."
    : 'No readings yet today.';
}

export function emptyHistoryMessage(tone: Tone): string {
  return tone === 'playful'
    ? 'No readings in this period. Your story starts with the next one.'
    : 'No readings in this period.';
}
