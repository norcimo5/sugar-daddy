import type { MetricDefinition, Result, Unit } from './types';

const NUMBER_RE = /^\d+([.,]\d+)?$/;

/** Parses a plain non-negative decimal ("5.5" or "5,5"). Returns null for anything else. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim();
  if (!NUMBER_RE.test(s)) return null;
  return Number(s.replace(',', '.'));
}

function decimalPlaces(raw: string): number {
  const m = /[.,](\d+)$/.exec(raw.trim());
  return m?.[1]?.length ?? 0;
}

/**
 * Cross-field rules, applied when a metric has all the named fields and each parsed cleanly.
 * Keyed by field shape rather than metric id so any metric with this shape gets the rule.
 */
const CROSS_FIELD_RULES: readonly {
  fields: readonly [string, string];
  errorField: string;
  check(a: number, b: number): string | null;
}[] = [
  {
    fields: ['systolic', 'diastolic'],
    errorField: 'diastolic',
    check: (sys, dia) => (dia >= sys ? 'Diastolic must be lower than systolic.' : null),
  },
];

/**
 * Validates entered strings for every field of `def`. On success returns parsed numbers exactly
 * as typed (never rounded or clamped); optional empty fields are omitted. On failure returns one
 * message per failing field.
 */
export function validateFields(
  def: MetricDefinition,
  raw: Record<string, string>,
  unit: Unit,
): Result<Record<string, number>, Record<string, string>> {
  const values: Record<string, number> = {};
  const errors: Record<string, string> = {};

  for (const f of def.fields) {
    const text = (raw[f.key] ?? '').trim();
    if (text === '') {
      if (f.required) errors[f.key] = 'Enter a number.';
      continue;
    }
    const n = parseNumber(text);
    if (n === null) {
      errors[f.key] = 'Enter a number.';
      continue;
    }
    const { min, max, maxDecimals } = f.limits(unit);
    if (n < min || n > max) {
      errors[f.key] = `Enter a number between ${min} and ${max} ${f.unitLabel ?? unit}.`;
      continue;
    }
    if (decimalPlaces(text) > maxDecimals) {
      errors[f.key] = `Use at most ${maxDecimals} decimal places.`;
      continue;
    }
    values[f.key] = n;
  }

  const keys = new Set(def.fields.map((f) => f.key));
  for (const rule of CROSS_FIELD_RULES) {
    const [ka, kb] = rule.fields;
    if (!keys.has(ka) || !keys.has(kb)) continue;
    const a = values[ka];
    const b = values[kb];
    if (a === undefined || b === undefined) continue;
    const msg = rule.check(a, b);
    if (msg !== null) errors[rule.errorField] = msg;
  }

  return Object.keys(errors).length > 0
    ? { ok: false, error: errors }
    : { ok: true, value: values };
}
