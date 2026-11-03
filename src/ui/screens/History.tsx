import { useState } from 'preact/hooks';
import { useApp } from '../context';
import { rangeFor, type RangeKind } from '../../domain/time';
import { emptyHistoryMessage } from '../../domain/copy';
import { RangeControls } from '../components/RangeControls';
import { MeasurementRow } from '../components/MeasurementRow';
import { MetricFilter } from '../components/MetricFilter';

export function History() {
  const app = useApp();
  const now = app.clock.now();
  const [kind, setKind] = useState<RangeKind>('week');
  const [anchor, setAnchor] = useState(now);
  const [metricId, setMetricId] = useState<string>('all');
  const range = rangeFor(kind, anchor);
  const from = range.start.toISOString();
  const to = range.end.toISOString();
  const enabled = new Set(app.enabledMetrics.map((d) => d.id));
  const rows = app.measurements.filter(
    (m) =>
      m.takenAt >= from &&
      m.takenAt < to &&
      (metricId === 'all' ? enabled.has(m.metricId) : m.metricId === metricId),
  );

  return (
    <section aria-labelledby="hist-h">
      <h2 id="hist-h">History</h2>
      <MetricFilter value={metricId} onChange={setMetricId} allowAll />
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
        <p class="muted" style={{ marginTop: 0 }} aria-live="polite" data-testid="history-count">
          {rows.length} reading{rows.length === 1 ? '' : 's'}
        </p>
        {rows.length ? (
          <ul class="list" data-testid="history-list">
            {rows.map((m) => {
              const def = app.registry.get(m.metricId);
              if (!def) return null;
              return (
                <li key={m.id}>
                  <MeasurementRow
                    m={m}
                    def={def}
                    config={app.configFor(m.metricId)}
                    showDate
                    showMetric={metricId === 'all' && app.enabledMetrics.length > 1}
                    onOpen={(id) => app.navigate(`/edit/${id}`)}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p class="empty">{emptyHistoryMessage(app.settings.tone)}</p>
        )}
      </div>
    </section>
  );
}
