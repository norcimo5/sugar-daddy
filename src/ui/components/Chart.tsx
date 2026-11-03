import { useState } from 'preact/hooks';
import type { Measurement, MetricConfig, MetricDefinition } from '../../domain/types';
import { formatDateTime, type DateRange, type RangeKind } from '../../domain/time';
import { convertValue, displayDecimals, formatNumber } from '../../domain/units';
import { contextLabel, formatMeasurementValue, unitLabel } from '../../domain/metrics';
import { evaluateStatus, statusLabel } from '../../domain/thresholds';
import { buildChartModel } from './chartModel';

const W = 340;
const H = 220;
const PAD = { top: 26, right: 12, bottom: 34, left: 44 };
const DASHES = ['', '6 4', '2 4'];

function xTicks(
  kind: RangeKind,
  range: DateRange,
): { t: Date; label: string; anchor: 'start' | 'middle' | 'end' }[] {
  const out: { t: Date; label: string; anchor: 'start' | 'middle' | 'end' }[] = [];
  const cur = new Date(range.start);
  if (kind === 'day') {
    for (let h = 0; h <= 24; h += 6) {
      const t = new Date(range.start);
      t.setHours(h, 0, 0, 0);
      if (h === 24) t.setTime(range.end.getTime());
      out.push({
        t,
        label: h === 24 ? '' : `${String(h).padStart(2, '0')}:00`,
        anchor: h === 0 ? 'start' : 'middle',
      });
    }
    return out;
  }
  const stepDays = kind === 'week' ? 1 : 7;
  while (cur < range.end) {
    // Week: label each day at its midpoint. Month: label the start of each week.
    const mid = new Date(cur);
    if (kind === 'week') mid.setHours(12, 0, 0, 0);
    out.push({
      t: mid,
      anchor: kind === 'week' ? 'middle' : 'start',
      label:
        kind === 'week'
          ? cur.toLocaleDateString(undefined, { weekday: 'short' })
          : cur.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    });
    cur.setDate(cur.getDate() + stepDays);
  }
  return out;
}

/** One metric per chart: never mixes unlike units on an axis. */
export function Chart(props: {
  def: MetricDefinition;
  config: MetricConfig | undefined;
  measurements: Measurement[];
  kind: RangeKind;
  range: DateRange;
}) {
  const { def, config } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const unit = config?.unit ?? def.defaultUnit;
  const fields = def.fields.filter((f) => !f.unitLabel);
  const series = fields.map((f) => ({
    key: f.key,
    points: props.measurements
      .filter((m) => typeof m.value[f.key] === 'number')
      .map((m) => ({
        t: new Date(m.takenAt),
        v: convertValue(m.value[f.key] as number, m.unit, unit),
        id: m.id,
      })),
  }));
  const primaryThresholds = config?.thresholds[def.primaryField];
  const tUnit = config?.thresholdUnit ?? unit;
  const band =
    primaryThresholds?.targetLow !== undefined && primaryThresholds?.targetHigh !== undefined
      ? {
          // Display-only conversion of the band; stored thresholds are never rewritten.
          low: convertValue(primaryThresholds.targetLow, tUnit, unit),
          high: convertValue(primaryThresholds.targetHigh, tUnit, unit),
        }
      : null;
  const model = buildChartModel({
    start: props.range.start,
    end: props.range.end,
    width: W,
    height: H,
    padding: PAD,
    series,
    band,
  });
  const ticks = xTicks(props.kind, props.range);
  const decimals = displayDecimals(unit);
  const uLabel = unitLabel(def, unit);
  const count = model.series[0]?.points.length ?? 0;

  const byId = new Map(props.measurements.map((m) => [m.id, m]));
  const statusText = (m: Measurement) => {
    const k = config ? evaluateStatus(def, config, m) : 'unconfigured';
    return k === 'unconfigured' ? '' : statusLabel(k);
  };
  const pointLabel = (m: Measurement) =>
    [
      `${formatMeasurementValue(def, m, unit)} ${uLabel}`,
      formatDateTime(new Date(m.takenAt)),
      contextLabel(def, m.context),
      statusText(m) || undefined,
    ]
      .filter(Boolean)
      .join(', ');
  const selectedM = selectedId ? byId.get(selectedId) : undefined;
  const selectedStatus = selectedM ? statusText(selectedM) : '';

  return (
    <figure class="chart" style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={`${def.name} chart in ${uLabel}. ${count} reading${count === 1 ? '' : 's'}. Details are listed below.`}
      >
        {model.band ? (
          <rect
            class="band"
            x={model.plot.x}
            y={model.band.y}
            width={model.plot.width}
            height={model.band.height}
          />
        ) : null}
        <g class="grid axis">
          {model.yTicks.map((t) => (
            <g key={t.value}>
              <line x1={model.plot.x} x2={model.plot.x + model.plot.width} y1={t.y} y2={t.y} />
              <text x={model.plot.x - 6} y={t.y + 4} text-anchor="end">
                {formatNumber(t.value, decimals)}
              </text>
            </g>
          ))}
          {ticks.map((t, i) => (
            <text key={i} x={model.xFor(t.t)} y={H - PAD.bottom + 16} text-anchor={t.anchor}>
              {t.label}
            </text>
          ))}
          <text x={4} y={12}>
            {uLabel}
          </text>
        </g>
        {model.series.map((s, i) => (
          <g key={s.key}>
            {s.path ? (
              <path class="series-line" d={s.path} stroke-dasharray={DASHES[i] || undefined} />
            ) : null}
            {s.points.map((p) => {
              const selected = i === 0 && p.id === selectedId;
              const dot = (
                <circle
                  key={`${p.id}-${s.key}`}
                  class={`series-point${selected ? ' selected' : ''}`}
                  cx={p.x}
                  cy={p.y}
                  r={i === 0 ? (selected ? 6.5 : 4.5) : 3.5}
                />
              );
              if (i !== 0) return dot;
              const m = byId.get(p.id);
              const label = m ? pointLabel(m) : '';
              // A large invisible hit area makes each reading easy to tap; one per reading.
              return (
                <g
                  key={`${p.id}-hit`}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={selected}
                  onClick={() => setSelectedId(selected ? null : p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(selected ? null : p.id);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
                  {dot}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <div class="chart-tip" aria-live="polite" data-testid="chart-tip" hidden={!selectedM}>
        {selectedM ? (
          <>
            <strong>
              {formatMeasurementValue(def, selectedM, unit)} {uLabel}
            </strong>
            <span>
              {formatDateTime(new Date(selectedM.takenAt))}
              {contextLabel(def, selectedM.context)
                ? ` · ${contextLabel(def, selectedM.context)}`
                : ''}
              {selectedStatus ? ` · ${selectedStatus}` : ''}
            </span>
          </>
        ) : null}
      </div>
      <figcaption class="hint">
        {fields.length > 1
          ? `${fields.map((f, i) => `${f.label} ${i === 0 ? '(solid)' : '(dashed)'}`).join(', ')}. `
          : ''}
        Points are your saved readings; lines only connect them. Tap a point for details.
        {band ? ' Shaded area: configured target range.' : ''}
      </figcaption>
    </figure>
  );
}
