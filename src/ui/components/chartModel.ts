export interface ChartPointIn {
  t: Date;
  v: number;
  id: string;
}
export interface ChartPoint extends ChartPointIn {
  x: number;
  y: number;
}
export interface ChartInput {
  start: Date;
  end: Date;
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  series: { key: string; points: ChartPointIn[] }[];
  band?: { low: number; high: number } | null;
}
export interface ChartModel {
  series: { key: string; points: ChartPoint[]; path: string }[];
  yMin: number;
  yMax: number;
  yTicks: { value: number; y: number }[];
  band: { y: number; height: number } | null;
  plot: { x: number; y: number; width: number; height: number };
  xFor(t: Date): number;
}

function niceStep(span: number, targetTicks: number): number {
  const raw = span / Math.max(1, targetTicks);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

/**
 * Pure chart geometry. Only real points inside [start, end) are plotted; a line is
 * drawn only between consecutive saved readings when there are two or more.
 */
export function buildChartModel(input: ChartInput): ChartModel {
  const { width, height, padding: p } = input;
  const plot = {
    x: p.left,
    y: p.top,
    width: width - p.left - p.right,
    height: height - p.top - p.bottom,
  };
  const t0 = input.start.getTime();
  const t1 = input.end.getTime();
  const inRange = input.series.map((s) => ({
    key: s.key,
    points: s.points
      .filter((pt) => pt.t.getTime() >= t0 && pt.t.getTime() < t1 && Number.isFinite(pt.v))
      .slice()
      .sort((a, b) => a.t.getTime() - b.t.getTime()),
  }));

  const values = inRange.flatMap((s) => s.points.map((pt) => pt.v));
  if (input.band) values.push(input.band.low, input.band.high);
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 1;
  if (lo === hi) {
    const pad = Math.max(1, Math.abs(lo) * 0.1);
    lo -= pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, 4);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil(hi / step) * step;

  const xFor = (t: Date) => plot.x + ((t.getTime() - t0) / (t1 - t0)) * plot.width;
  const yFor = (v: number) => plot.y + plot.height - ((v - yMin) / (yMax - yMin)) * plot.height;

  const series = inRange.map((s) => {
    const points = s.points.map((pt) => ({ ...pt, x: xFor(pt.t), y: yFor(pt.v) }));
    const path =
      points.length >= 2
        ? points
            .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
            .join(' ')
        : '';
    return { key: s.key, points, path };
  });

  const yTicks: { value: number; y: number }[] = [];
  for (let v = yMin; v <= yMax + step / 1e6; v += step) {
    const value = Number(v.toFixed(6));
    yTicks.push({ value, y: yFor(value) });
  }

  const band = input.band
    ? { y: yFor(input.band.high), height: yFor(input.band.low) - yFor(input.band.high) }
    : null;

  return { series, yMin, yMax, yTicks, band, plot, xFor };
}
