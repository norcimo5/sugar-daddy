export interface RingGaugeProps {
  value: string;
  unit: string;
  caption: string;
  /** Position within the configured range, 0..1. Arc is drawn only when finite. */
  fraction?: number | null;
  /** Prefix for the accessible name; defaults to "Latest reading". */
  label?: string;
}

const SIZE = 240;
const C = SIZE / 2;
const ARC_R = 86;
const CIRCUMFERENCE = 2 * Math.PI * ARC_R;
const TICKS = 60;

const ticks = Array.from({ length: TICKS }, (_, i) => {
  const major = i % 5 === 0;
  const a = (i / TICKS) * 2 * Math.PI;
  const r1 = major ? 97 : 100;
  const r2 = 106;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  return {
    major,
    x1: C + r1 * sin,
    y1: C - r1 * cos,
    x2: C + r2 * sin,
    y2: C - r2 * cos,
  };
});

/** Decorative HUD dial around the latest reading. Range arc only when `fraction` is known. */
export function RingGauge({ value, unit, caption, fraction, label }: RingGaugeProps) {
  const hasArc = typeof fraction === 'number' && Number.isFinite(fraction);
  const drawn = hasArc ? Math.min(1, Math.max(0, fraction)) : 0;
  const length = drawn * CIRCUMFERENCE;

  return (
    <div
      class="ring"
      role="group"
      aria-label={`${label ?? 'Latest reading'}: ${value} ${unit}, ${caption}`}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false">
        <circle class="ring-outer" cx={C} cy={C} r={114} />
        <g class="ring-ticks">
          {ticks.map((t, i) => (
            <line
              key={i}
              class={`ring-tick${t.major ? ' major' : ''}`}
              x1={t.x1.toFixed(2)}
              y1={t.y1.toFixed(2)}
              x2={t.x2.toFixed(2)}
              y2={t.y2.toFixed(2)}
            />
          ))}
        </g>
        <circle class="ring-track" cx={C} cy={C} r={ARC_R} />
        <circle class="ring-inner" cx={C} cy={C} r={72} />
        {hasArc ? (
          <circle
            class="ring-arc"
            cx={C}
            cy={C}
            r={ARC_R}
            transform={`rotate(-90 ${C} ${C})`}
            stroke-dasharray={`${length.toFixed(3)} ${CIRCUMFERENCE.toFixed(3)}`}
            data-length={length}
            data-circumference={CIRCUMFERENCE}
          />
        ) : null}
      </svg>
      <div class="ring-center">
        <span class="ring-value">{value}</span>
        <span class="ring-unit">{unit}</span>
        <span class="ring-caption">{caption}</span>
      </div>
    </div>
  );
}
