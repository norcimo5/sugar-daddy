import { useState } from 'preact/hooks';
import type { Measurement, MetricDefinition } from '../../domain/types';
import { useApp } from '../context';
import { contextLabel, formatMeasurementValue, unitLabel } from '../../domain/metrics';
import { evaluateStatus } from '../../domain/thresholds';
import { formatDateTime, formatRangeLabel, rangeFor, type RangeKind } from '../../domain/time';
import { readingShareText, summaryShareText } from '../../domain/share';
import { shareOrCopy, type ShareOutcome } from '../../app/share';
import { RangeControls } from '../components/RangeControls';
import { Chart } from '../components/Chart';
import { StatusBadge } from '../components/StatusBadge';
import { Icon } from '../components/Icon';

const RECENT = 5;

export function shareMessage(outcome: ShareOutcome): string | null {
  switch (outcome) {
    case 'shared':
      return 'Shared.';
    case 'copied':
      return 'Copied. You can paste it into a message.';
    case 'cancelled':
      return null;
    default:
      return 'Sharing is not available on this device.';
  }
}

export function MetricDetail({ metricId }: { metricId: string }) {
  const app = useApp();
  const def = app.registry.get(metricId);
  const config = def ? app.configFor(def.id) : undefined;
  const now = app.clock.now();
  const [kind, setKind] = useState<RangeKind>('week');
  const [anchor, setAnchor] = useState(now);

  if (!def || !config?.enabled) {
    return (
      <section class="card">
        <h2>Not available</h2>
        <p>This measurement is not turned on. You can turn it on in Settings.</p>
        <a class="btn" href="#/settings">
          Open Settings
        </a>
      </section>
    );
  }

  const unit = config.unit;
  const all = app.measurements.filter((m) => m.metricId === def.id);
  const range = rangeFor(kind, anchor);
  const from = range.start.toISOString();
  const to = range.end.toISOString();
  const inRange = all.filter((m) => m.takenAt >= from && m.takenAt < to);

  async function share(text: string) {
    const msg = shareMessage(await shareOrCopy(text));
    if (msg) app.toast(msg, msg.startsWith('Sharing is not') ? 'error' : 'info');
  }

  return (
    <section aria-labelledby="metric-h" class="has-sticky-cta">
      <div class="title-row">
        <h2 id="metric-h">{def.name}</h2>
        <button
          type="button"
          class="icon-btn"
          aria-label={`Share ${def.name.toLowerCase()} summary for this ${kind}`}
          onClick={() =>
            share(
              summaryShareText(def, inRange.slice().reverse(), formatRangeLabel(kind, range), unit),
            )
          }
        >
          <Icon name="share" />
        </button>
      </div>

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
        <p class="label" style={{ marginTop: 0 }}>
          {def.shortName} · {unitLabel(def, unit)}
        </p>
        {inRange.length ? (
          <Chart def={def} config={config} measurements={inRange} kind={kind} range={range} />
        ) : (
          <p class="empty">No {def.name.toLowerCase()} readings in this period.</p>
        )}
      </div>

      <div class="card">
        <div class="title-row">
          <h3 style={{ margin: 0 }}>Recent</h3>
          <a href={`#/history/${def.id}`} class="btn-link">
            View all ›
          </a>
        </div>
        {all.length ? (
          <ul class="list" data-testid="recent-list">
            {all.slice(0, RECENT).map((m) => (
              <li key={m.id}>
                <ReadingItem def={def} m={m} onShare={share} />
              </li>
            ))}
          </ul>
        ) : (
          <p class="empty">No readings yet.</p>
        )}
      </div>

      <div class="sticky-cta">
        <a class="btn btn-primary btn-xl" href={`#/log/${def.id}`} data-testid="add-record">
          <Icon name="plus" />
          Add new record
        </a>
      </div>
    </section>
  );
}

function ReadingItem(props: {
  def: MetricDefinition;
  m: Measurement;
  onShare(text: string): void;
}) {
  const app = useApp();
  const { def, m } = props;
  const config = app.configFor(def.id);
  const unit = config?.unit ?? m.unit;
  const status = config ? evaluateStatus(def, config, m) : 'unconfigured';
  const ctx = contextLabel(def, m.context);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const valueText = `${formatMeasurementValue(def, m, unit)} ${unitLabel(def, unit)}`;
  const when = formatDateTime(new Date(m.takenAt));

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await app.actions.deleteMeasurement(m.id);
      app.toast('Reading deleted.');
    } catch (e) {
      app.toast(e instanceof Error ? e.message : 'Could not delete.', 'error');
      setBusy(false);
    }
  }

  return (
    <div class="reading-item">
      <div class="row-main">
        <span class="row-value">
          {formatMeasurementValue(def, m, unit)}
          <small>{unitLabel(def, unit)}</small>
        </span>
        <span class="row-meta" style={{ display: 'block' }}>
          {[ctx, when].filter(Boolean).join(' · ')}
          {m.note ? ' · Note' : ''}
        </span>
        {status !== 'unconfigured' ? <StatusBadge kind={status} /> : null}
      </div>
      {confirm ? (
        <div role="alertdialog" aria-label={`Delete ${valueText}?`} class="inline-confirm">
          <span>Delete?</span>
          <button type="button" class="btn-danger" disabled={busy} onClick={remove} autoFocus>
            Yes, delete
          </button>
          <button type="button" onClick={() => setConfirm(false)}>
            Keep
          </button>
        </div>
      ) : (
        <div class="item-actions">
          <a class="icon-btn" href={`#/edit/${m.id}`} aria-label={`Edit ${valueText}, ${when}`}>
            <Icon name="edit" />
          </a>
          <button
            type="button"
            class="icon-btn"
            aria-label={`Share ${valueText}, ${when}`}
            onClick={() => props.onShare(readingShareText(def, m, unit, status))}
          >
            <Icon name="share" />
          </button>
          <button
            type="button"
            class="icon-btn"
            aria-label={`Delete ${valueText}, ${when}`}
            onClick={() => setConfirm(true)}
          >
            <Icon name="trash" />
          </button>
        </div>
      )}
    </div>
  );
}
