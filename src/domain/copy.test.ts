import { describe, expect, it } from 'vitest';
import {
  CARE_TEAM_NOTE,
  DISCLAIMER,
  TAGLINE,
  emptyHistoryMessage,
  emptyTodayMessage,
  savedMessage,
  welcomeMessage,
} from './copy';
import type { StatusKind, Tone } from './types';

const TONES: Tone[] = ['playful', 'neutral'];
const STATUSES: StatusKind[] = [
  'unconfigured',
  'in_range',
  'below_target',
  'above_target',
  'below_alert',
  'above_alert',
];
const CONCERNING: StatusKind[] = ['below_target', 'above_target', 'below_alert', 'above_alert'];

describe('fixed strings', () => {
  it('DISCLAIMER is exact', () => {
    expect(DISCLAIMER).toBe(
      "Sugar Daddy records and displays measurements. It does not provide medical advice. Follow your care team's instructions.",
    );
  });
  it('CARE_TEAM_NOTE is exact', () => {
    expect(CARE_TEAM_NOTE).toBe(
      "If you're in hospital, contact your nurse or care team with any concerns, symptoms, or questions about a reading.",
    );
  });
  it('TAGLINE is exact', () => {
    expect(TAGLINE).toBe('Your glucose. Your rules.');
  });
});

describe('savedMessage', () => {
  it('playful + in range', () => {
    expect(savedMessage('playful', 'in_range')).toBe(
      "Reading saved. Daddy says you're looking good.",
    );
  });
  it('playful + unconfigured', () => {
    expect(savedMessage('playful', 'unconfigured')).toBe('Reading saved. Sweet and simple.');
  });
  it.each(STATUSES)('neutral + %s is plain', (status) => {
    expect(savedMessage('neutral', status)).toBe('Reading saved.');
  });

  describe('never playful for concerning statuses (exhaustive over StatusKind × Tone)', () => {
    const cases = TONES.flatMap((tone) => CONCERNING.map((status) => [tone, status] as const));
    it.each(cases)('%s + %s → "Reading saved."', (tone, status) => {
      expect(savedMessage(tone, status)).toBe('Reading saved.');
    });
  });

  it('only non-concerning statuses ever get playful copy', () => {
    for (const tone of TONES) {
      for (const status of STATUSES) {
        const msg = savedMessage(tone, status);
        if (tone === 'neutral' || CONCERNING.includes(status)) expect(msg).toBe('Reading saved.');
        else expect(msg).not.toBe('Reading saved.');
      }
    }
  });
});

describe('welcome and empty states', () => {
  it('welcome', () => {
    expect(welcomeMessage('playful')).toBe('Welcome to Sugar Daddy. Your glucose. Your rules.');
    expect(welcomeMessage('neutral')).toBe('Welcome to Sugar Daddy.');
  });
  it('empty today', () => {
    expect(emptyTodayMessage('playful')).toBe(
      "No readings yet today. Whenever you're ready, Daddy's listening.",
    );
    expect(emptyTodayMessage('neutral')).toBe('No readings yet today.');
  });
  it('empty history', () => {
    expect(emptyHistoryMessage('neutral')).toBe('No readings in this period.');
    expect(emptyHistoryMessage('playful')).toMatch(/^No readings in this period\. /);
  });
  it.each([welcomeMessage, emptyTodayMessage, emptyHistoryMessage])(
    'neutral never mentions Daddy (%#)',
    (fn) => {
      expect(fn('neutral')).not.toMatch(/daddy says|daddy's/i);
    },
  );
});

describe('tone guard', () => {
  const all = [
    DISCLAIMER,
    CARE_TEAM_NOTE,
    TAGLINE,
    ...TONES.flatMap((t) => [
      welcomeMessage(t),
      emptyTodayMessage(t),
      emptyHistoryMessage(t),
      ...STATUSES.map((s) => savedMessage(t, s)),
    ]),
  ];
  const banned =
    /\b(sexy|hot|babe|baby|naughty|kiss|spank|honey|darling|lazy|bad|naughty|shame|should have|failed|cheat|oops|lol|haha)\b/i;
  it.each(all)('%j has no sexualised, shaming or joking language', (s) => {
    expect(s).not.toMatch(banned);
    expect(s).not.toMatch(/!/);
  });
});
