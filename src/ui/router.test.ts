import { parseRoute } from './router';

describe('parseRoute', () => {
  it.each([
    ['', { name: 'today' }],
    ['#/', { name: 'today' }],
    ['#/log/glucose', { name: 'log', metricId: 'glucose' }],
    ['#/log', { name: 'log', metricId: 'glucose' }],
    ['#/edit/abc-123', { name: 'edit', id: 'abc-123' }],
    ['#/edit', { name: 'history' }],
    ['#/history', { name: 'history' }],
    ['#/trends', { name: 'trends' }],
    ['#/settings', { name: 'settings' }],
    ['#/about', { name: 'about' }],
    ['#/nonsense', { name: 'today' }],
  ])('%s', (hash, expected) => {
    expect(parseRoute(hash)).toEqual(expected);
  });
});
