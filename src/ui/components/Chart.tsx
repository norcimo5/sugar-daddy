import type { Measurement, MetricConfig, MetricDefinition } from '../../domain/types';
import type { DateRange, RangeKind } from '../../domain/time';
import { convertValue, displayDecimals, formatNumber } from '../../domain/units';
import { unitLabel } from '../../domain/metrics';
import { buildChartModel } from './chartModel';

const W = 340;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 34, left: 44 };
const DASHES = ['', '6 4', '2 4'];

function xTicks(kind: RangeKind, range: DateRange): { t: Date; label: string }[] {
  const out: { t: Date; label: string }[] = [];
  const cur = new Date(range.start);
  if (kind === 'day') {
    for (let h = 0; h <= 24; h += 6) {
      const t = new Date(range.start);
      t.setHours(h, 0, 0, 0);
      if (h === 24) t.setTime(range.end.getTime());
      out.push({ t, label: h === 24 ? '' : `${String(h).padStart(2, '0')}:00` });
    }
    return out;
  }
  const stepDays = kind === 'week' ? 1 : 7;
  while (cur < range.end) {
    out.push({
      t: new Date(cur),
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
  const band =
    primaryThresholds?.targetLow !== undefined && primaryThresholds?.targetHigh !== undefined
      ? { low: primaryThresholds.targetLow, high: primaryThresholds.targetHigh }
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

  return (
    <figure class="chart" style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
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
            <text
              key={i}
              x={model.xFor(t.t)}
              y={H - PAD.bottom + 16}
              text-anchor={i === 0 ? 'start' : 'middle'}
            >
              {t.label}
            </text>
          ))}
          <text x={4} y={10}>
            {uLabel}
          </text>
        </g>
        {model.series.map((s, i) => (
          <g key={s.key}>
            {s.path ? (
              <path class="series-line" d={s.path} stroke-dasharray={DASHES[i] || undefined} />
            ) : null}
            {s.points.map((p) => (
              <circle
                key={`${p.id}-${s.key}`}
                class="series-point"
                cx={p.x}
                cy={p.y}
                r={i === 0 ? 4.5 : 3.5}
              />
            ))}
          </g>
        ))}
      </svg>
      <figcaption class="hint">
        {fields.length > 1
          ? `${fields.map((f, i) => `${f.label} ${i === 0 ? '(solid)' : '(dashed)'}`).join(', ')}. `
          : ''}
        Points are your saved readings; lines only connect them.
        {band ? ' Shaded area: configured target range.' : ''}
      </figcaption>
    </figure>
  );
}
