import type { Measurement, MetricConfig, MetricDefinition } from '../domain/types';
import { convertValue } from '../domain/units';

/**
 * Where a reading sits inside the clinician's target range, 0..1 (display only).
 * Returns null unless both target low and high are configured — the ring then shows no fill
 * rather than an invented scale.
 */
export function targetFraction(
  def: MetricDefinition,
  config: MetricConfig,
  m: Measurement,
): number | null {
  const t = config.thresholds[def.primaryField];
  const v = m.value[def.primaryField];
  if (t?.targetLow === undefined || t.targetHigh === undefined || v === undefined) return null;
  if (t.targetHigh <= t.targetLow) return null;
  const inUnit = convertValue(v, m.unit, config.thresholdUnit ?? config.unit);
  const f = (inUnit - t.targetLow) / (t.targetHigh - t.targetLow);
  return Math.min(1, Math.max(0, f));
}
