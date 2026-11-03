import { parseRoute } from './router';

describe('parseRoute', () => {
  it.each([
    ['', { name: 'today' }],
    ['#/', { name: 'today' }],
    ['#/log/glucose', { name: 'log', metricId: 'glucose' }],
    ['#/log', { name: 'log', metricId: '' }],
    ['#/edit/abc-123', { name: 'edit', id: 'abc-123' }],
    ['#/edit', { name: 'history' }],
    ['#/history', { name: 'history' }],
    ['#/history/blood_pressure', { name: 'history', metricId: 'blood_pressure' }],
    ['#/metric/glucose', { name: 'metric', metricId: 'glucose' }],
    ['#/metric', { name: 'today' }],
    ['#/guide', { name: 'guide' }],
    ['#/trends', { name: 'trends' }],
    ['#/settings', { name: 'settings' }],
    ['#/about', { name: 'about' }],
    ['#/nonsense', { name: 'today' }],
    ['#/edit/%E0%A4%A', { name: 'edit', id: '%E0%A4%A' }],
  ])('%s', (hash, expected) => {
    expect(parseRoute(hash)).toEqual(expected);
  });
});
