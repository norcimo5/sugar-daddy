import { useState } from 'preact/hooks';
import { useApp } from '../context';
import { formatDateTime, rangeFor, type RangeKind } from '../../domain/time';
import { convertValue, displayDecimals, formatNumber } from '../../domain/units';
import { formatMeasurementValue, primaryMetric, unitLabel } from '../../domain/metrics';
import { RangeControls } from '../components/RangeControls';
import { MetricFilter } from '../components/MetricFilter';
import { Chart } from '../components/Chart';

export function Trends() {
  const app = useApp();
  const now = app.clock.now();
  const [kind, setKind] = useState<RangeKind>('week');
  const [anchor, setAnchor] = useState(now);
  const [metricId, setMetricId] = useState<string>(
    app.enabledMetrics[0]?.id ?? primaryMetric(app.registry).id,
  );
  const def = app.registry.get(metricId) ?? primaryMetric(app.registry);
  const config = app.configFor(def.id);
  const unit = config?.unit ?? def.defaultUnit;
  const range = rangeFor(kind, anchor);
  const from = range.start.toISOString();
  const to = range.end.toISOString();
  const rows = app.measurements.filter(
    (m) => m.metricId === def.id && m.takenAt >= from && m.takenAt < to,
  );
  const primary = rows
    .map((m) => m.value[def.primaryField])
    .filter((v): v is number => typeof v === 'number');
  const values = rows.map((m) => convertValue(m.value[def.primaryField] ?? NaN, m.unit, unit));
  const dec = displayDecimals(unit);
  const uLabel = unitLabel(def, unit);
  const latest = rows[0];
  const fieldLabel = def.fields.length > 1 ? `${def.fields[0]?.label} ` : '';

  return (
    <section aria-labelledby="trends-h">
      <h2 id="trends-h">Trends</h2>
      <MetricFilter value={def.id} onChange={setMetricId} />
      <RangeControls
        kind={kind}
        anchor={anchor}
        now={now}
        onChange={(k, a) => {
          setKind(k);
          setAnchor(a);
        }}
      />
      <div class="card">
        <h3 style={{ marginTop: 0 }}>
          {def.name} <span class="muted">({uLabel})</span>
        </h3>
        {rows.length ? (
          <>
            <Chart def={def} config={config} measurements={rows} kind={kind} range={range} />
            <dl class="summary-grid" data-testid="trend-summary">
              <div>
                <dt>Readings</dt>
                <dd>{rows.length}</dd>
              </div>
              {primary.length ? (
                <>
                  <div>
                    <dt>{fieldLabel}Lowest</dt>
                    <dd>{formatNumber(Math.min(...values), dec)}</dd>
                  </div>
                  <div>
                    <dt>{fieldLabel}Highest</dt>
                    <dd>{formatNumber(Math.max(...values), dec)}</dd>
                  </div>
                </>
              ) : null}
              {latest ? (
                <div>
                  <dt>Latest</dt>
                  <dd>{formatMeasurementValue(def, latest, unit)}</dd>
                </div>
              ) : null}
            </dl>
            {rows.length < 3 ? (
              <p class="hint">Only a few readings in this period, so no pattern is shown.</p>
            ) : null}
          </>
        ) : (
          <p class="empty">No {def.name.toLowerCase()} readings in this period.</p>
        )}
      </div>
      {rows.length ? (
        <details class="card">
          <summary style={{ minHeight: '44px', fontWeight: 650, cursor: 'pointer' }}>
            Show readings as a table
          </summary>
          <table class="data">
            <caption class="sr-only">
              {def.name} readings in {uLabel}
            </caption>
            <thead>
              <tr>
                <th scope="col">Date and time</th>
                <th scope="col">Value ({uLabel})</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{formatDateTime(new Date(m.takenAt))}</td>
                  <td>{formatMeasurementValue(def, m, unit)}</td>
                  <td>{m.note ? 'Yes' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </section>
  );
}
