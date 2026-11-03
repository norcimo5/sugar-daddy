import { useApp } from '../context';

export function MetricFilter(props: {
  value: string;
  onChange(id: string): void;
  allowAll?: boolean;
}) {
  const app = useApp();
  if (app.enabledMetrics.length <= 1 && !props.allowAll) return null;
  if (app.enabledMetrics.length <= 1) return null;
  return (
    <div class="field">
      <label for="metric-filter">Measurement</label>
      <select
        id="metric-filter"
        value={props.value}
        onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}
      >
        {props.allowAll ? <option value="all">All measurements</option> : null}
        {app.enabledMetrics.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
}
