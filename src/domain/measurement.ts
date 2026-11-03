import type { Measurement, MeasurementInput, MetricDefinition, Result } from './types';
import { validateFields } from './validation';

/** How far ahead of `now` a takenAt may be (device clock skew allowance). */
const MAX_FUTURE_MS = 5 * 60 * 1000;

type Errors = Record<string, string>;
type Fields = Pick<Measurement, 'metricId' | 'value' | 'raw' | 'unit' | 'takenAt' | 'timeZone'> & {
  note: string | undefined;
  context: string | undefined;
};

/** Validates input against `def` and returns the measurement fields shared by build/revise. */
function validateInput(
  def: MetricDefinition,
  input: MeasurementInput,
  now: Date,
): Result<Fields, Errors> {
  const errors: Errors = {};
  let value: Record<string, number> = {};

  if (input.metricId !== def.id) {
    errors.metricId = 'Reading does not match this metric.';
  }
  if (!def.units.includes(input.unit)) {
    errors.unit = 'Choose a supported unit.';
  } else {
    const fields = validateFields(def, input.raw, input.unit);
    if (fields.ok) value = fields.value;
    else Object.assign(errors, fields.error);
  }

  const context = input.context?.trim() || undefined;
  if (context !== undefined && !def.contexts?.some((c) => c.key === context)) {
    errors.context = 'Choose an option from the list.';
  }

  const takenMs = Date.parse(input.takenAt);
  if (Number.isNaN(takenMs)) errors.takenAt = 'Enter a valid date and time.';
  else if (takenMs > now.getTime() + MAX_FUTURE_MS)
    errors.takenAt = 'Time cannot be in the future.';

  if (Object.keys(errors).length > 0) return { ok: false, error: errors };

  const raw: Record<string, string> = {};
  for (const key of Object.keys(value)) raw[key] = (input.raw[key] ?? '').trim();
  const note = input.note?.trim();

  return {
    ok: true,
    value: {
      metricId: def.id,
      value,
      raw,
      unit: input.unit,
      takenAt: new Date(takenMs).toISOString(),
      timeZone: input.timeZone,
      note: note === '' ? undefined : note,
      context,
    },
  };
}

/** Adds the optional note/context only when present, so absent keys stay absent. */
function withOptional(
  m: Omit<Measurement, 'note' | 'context'>,
  note: string | undefined,
  context: string | undefined,
): Measurement {
  const out: Measurement = { ...m };
  if (note !== undefined) out.note = note;
  if (context !== undefined) out.context = context;
  return out;
}

export function buildMeasurement(
  def: MetricDefinition,
  input: MeasurementInput,
  now: Date,
  newId: () => string,
): Result<Measurement, Record<string, string>> {
  const r = validateInput(def, input, now);
  if (!r.ok) return r;
  const { note, context, ...fields } = r.value;
  const ts = now.toISOString();
  return {
    ok: true,
    value: withOptional(
      { id: newId(), ...fields, source: 'manual', createdAt: ts, updatedAt: ts },
      note,
      context,
    ),
  };
}

export function reviseMeasurement(
  existing: Measurement,
  def: MetricDefinition,
  input: MeasurementInput,
  now: Date,
): Result<Measurement, Record<string, string>> {
  const r = validateInput(def, input, now);
  if (!r.ok) return r;
  const { note, context, ...fields } = r.value;
  return {
    ok: true,
    value: withOptional(
      {
        id: existing.id,
        ...fields,
        source: existing.source,
        createdAt: existing.createdAt,
        updatedAt: now.toISOString(),
      },
      note,
      context,
    ),
  };
}
