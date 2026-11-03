import type { RangeKind } from '../../domain/time';
import { formatRangeLabel, rangeFor, shiftAnchor } from '../../domain/time';
import { Icon } from './Icon';

const KINDS: { kind: RangeKind; label: string }[] = [
  { kind: 'day', label: 'Day' },
  { kind: 'week', label: 'Week' },
  { kind: 'month', label: 'Month' },
];

export function RangeControls(props: {
  kind: RangeKind;
  anchor: Date;
  now: Date;
  onChange(kind: RangeKind, anchor: Date): void;
}) {
  const range = rangeFor(props.kind, props.anchor);
  const atPresent = range.end.getTime() > props.now.getTime();
  return (
    <div>
      <div class="segmented" role="group" aria-label="Time range">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            aria-pressed={props.kind === k.kind}
            onClick={() => props.onChange(k.kind, props.anchor)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div class="range-nav">
        <button
          type="button"
          aria-label={`Previous ${props.kind}`}
          onClick={() => props.onChange(props.kind, shiftAnchor(props.kind, props.anchor, -1))}
        >
          <Icon name="left" />
        </button>
        <span class="range-label" aria-live="polite">
          {formatRangeLabel(props.kind, range)}
        </span>
        <button
          type="button"
          aria-label={`Next ${props.kind}`}
          disabled={atPresent}
          onClick={() => props.onChange(props.kind, shiftAnchor(props.kind, props.anchor, 1))}
        >
          <Icon name="right" />
        </button>
      </div>
    </div>
  );
}
