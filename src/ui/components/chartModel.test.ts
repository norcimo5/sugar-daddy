import { buildChartModel } from './chartModel';

const start = new Date('2026-11-03T05:00:00.000Z');
const end = new Date('2026-11-04T05:00:00.000Z');
const base = {
  start,
  end,
  width: 300,
  height: 200,
  padding: { top: 10, right: 10, bottom: 30, left: 40 },
};

describe('buildChartModel', () => {
  it('returns no points for an empty series', () => {
    const m = buildChartModel({ ...base, series: [{ key: 'v', points: [] }] });
    expect(m.series[0]!.points).toEqual([]);
    expect(m.series[0]!.path).toBe('');
  });

  it('maps time to x within the plot area and draws no line for a single point', () => {
    const t = new Date('2026-11-03T17:00:00.000Z');
    const m = buildChartModel({
      ...base,
      series: [{ key: 'v', points: [{ t, v: 120, id: 'a' }] }],
    });
    const p = m.series[0]!.points[0]!;
    expect(p.x).toBeCloseTo(40 + (250 * 12) / 24);
    expect(p.y).toBeGreaterThanOrEqual(10);
    expect(p.y).toBeLessThanOrEqual(170);
    expect(m.series[0]!.path).toBe('');
  });

  it('keeps every reading, including two at the same instant', () => {
    const t = new Date('2026-11-03T17:00:00.000Z');
    const m = buildChartModel({
      ...base,
      series: [
        {
          key: 'v',
          points: [
            { t, v: 100, id: 'a' },
            { t, v: 140, id: 'b' },
          ],
        },
      ],
    });
    expect(m.series[0]!.points.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('includes the configured band in the y domain and omits it otherwise', () => {
    const t = new Date('2026-11-03T17:00:00.000Z');
    const pts = [{ key: 'v', points: [{ t, v: 100, id: 'a' }] }];
    const withBand = buildChartModel({ ...base, series: pts, band: { low: 70, high: 180 } });
    expect(withBand.yMin).toBeLessThanOrEqual(70);
    expect(withBand.yMax).toBeGreaterThanOrEqual(180);
    expect(withBand.band).not.toBeNull();
    expect(buildChartModel({ ...base, series: pts }).band).toBeNull();
  });

  it('higher values are drawn higher (smaller y)', () => {
    const m = buildChartModel({
      ...base,
      series: [
        {
          key: 'v',
          points: [
            { t: new Date('2026-11-03T10:00:00.000Z'), v: 80, id: 'a' },
            { t: new Date('2026-11-03T20:00:00.000Z'), v: 200, id: 'b' },
          ],
        },
      ],
    });
    const [a, b] = m.series[0]!.points;
    expect(b!.y).toBeLessThan(a!.y);
    expect(m.series[0]!.path.startsWith('M')).toBe(true);
  });

  it('ignores points outside the time window', () => {
    const m = buildChartModel({
      ...base,
      series: [{ key: 'v', points: [{ t: new Date('2026-11-05T00:00:00.000Z'), v: 1, id: 'x' }] }],
    });
    expect(m.series[0]!.points).toEqual([]);
  });

  it('produces y ticks inside the domain', () => {
    const m = buildChartModel({
      ...base,
      series: [
        { key: 'v', points: [{ t: new Date('2026-11-03T10:00:00.000Z'), v: 123, id: 'a' }] },
      ],
    });
    expect(m.yTicks.length).toBeGreaterThanOrEqual(2);
    for (const tick of m.yTicks) {
      expect(tick.value).toBeGreaterThanOrEqual(m.yMin);
      expect(tick.value).toBeLessThanOrEqual(m.yMax);
    }
  });
});
