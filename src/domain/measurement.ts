import type { Measurement, MeasurementInput, MetricDefinition, Result } from './types';
import { validateFields } from './validation';

/** How far ahead of `now` a takenAt may be (device clock skew allowance). */
const MAX_FUTURE_MS = 5 * 60 * 1000;

type Errors = Record<string, string>;
type Fields = Pick<Measurement, 'metricId' | 'value' | 'raw' | 'unit' | 'takenAt' | 'timeZone'> & {
  note: string | undefined;
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
    },
  };
}

function withNote(m: Omit<Measurement, 'note'>, note: string | undefined): Measurement {
  return note === undefined ? m : { ...m, note };
}

export function buildMeasurement(
  def: MetricDefinition,
  input: MeasurementInput,
  now: Date,
  newId: () => string,
): Result<Measurement, Record<string, string>> {
  const r = validateInput(def, input, now);
  if (!r.ok) return r;
  const { note, ...fields } = r.value;
  const ts = now.toISOString();
  return {
    ok: true,
    value: withNote(
      { id: newId(), ...fields, source: 'manual', createdAt: ts, updatedAt: ts },
      note,
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
  const { note, ...fields } = r.value;
  return {
    ok: true,
    value: withNote(
      {
        id: existing.id,
        ...fields,
        source: existing.source,
        createdAt: existing.createdAt,
        updatedAt: now.toISOString(),
      },
      note,
    ),
  };
}
