import type { Measurement, MetricConfig, MetricDefinition } from '../../domain/types';
import { contextLabel, formatMeasurementValue, unitLabel } from '../../domain/metrics';
import { evaluateStatus, statusLabel } from '../../domain/thresholds';
import { formatDateTime, formatTime } from '../../domain/time';
import { Icon } from './Icon';

export function MeasurementRow(props: {
  m: Measurement;
  def: MetricDefinition;
  config: MetricConfig | undefined;
  showDate?: boolean;
  showMetric?: boolean;
  onOpen(id: string): void;
}) {
  const { m, def, config } = props;
  const displayUnit = config?.unit ?? m.unit;
  const value = formatMeasurementValue(def, m, displayUnit);
  const unit = unitLabel(def, displayUnit);
  const when = new Date(m.takenAt);
  const time = props.showDate ? formatDateTime(when) : formatTime(when);
  const status = config ? evaluateStatus(def, config, m) : 'unconfigured';
  const statusText = status === 'unconfigured' ? '' : statusLabel(status);
  const ctx = contextLabel(def, m.context);
  const label = [
    props.showMetric ? def.name : null,
    `${value} ${unit}`,
    ctx ?? null,
    time,
    statusText || null,
    m.note ? 'has a note' : null,
    'Open to edit or delete',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <button type="button" class="row" onClick={() => props.onOpen(m.id)} aria-label={label}>
      <span class="row-main">
        <span class="row-value">
          {value}
          <small>{unit}</small>
        </span>
        <span class="row-meta" style={{ display: 'block' }}>
          {props.showMetric ? `${def.shortName} · ` : ''}
          {ctx ? `${ctx} · ` : ''}
          {time}
          {statusText ? ` · ${statusText}` : ''}
        </span>
      </span>
      {m.note ? <Icon name="note" label="Has a note" /> : null}
      <span class="chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
